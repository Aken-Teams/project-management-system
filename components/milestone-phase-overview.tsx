'use client'

import { useMemo, useState, useEffect } from 'react'
import { ChevronDown, Flag, SlidersHorizontal, Rows3, Merge, Shrink, MoveHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todayUtc } from '@/lib/date-utils'
import { useAuth } from '@/lib/auth-context'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import type { Project, Milestone } from '@/lib/mock-data'

const fmtDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '/')

// 階段 hover 卡：名稱 + 起訖日 + 天數 + 狀態/進度（狀態與顏色一律走 phaseTone，全圖一致）
// hover：一般＝簡版（名稱／期間／狀態·進度）；聚焦(active)的階段＝詳版（進度條＋落後/超前＋截止＋遲交），給主管看
function PhaseTip({ p, today, isBottleneck, detailed }: { p: Phase; today: Date; isBottleneck?: boolean; detailed?: boolean }) {
  const dayMs = 86400000
  const days = Math.round((p.end.getTime() - p.start.getTime()) / dayMs) + 1
  const v = phaseTone(p, today)
  const done = p.status === 'done'
  if (!detailed) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5"><span className="font-semibold">{p.name}</span>{isBottleneck && <span className="text-[10px] px-1 rounded bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400">⚠ 瓶頸</span>}</div>
        <div className="tabular-nums text-muted-foreground">{fmtDate(p.start)} ~ {fmtDate(p.end)}（{days} 天）</div>
        <div className="text-muted-foreground">狀態：{v.label} · 進度 {done ? 100 : Math.max(0, Math.min(100, p.progress))}%</div>
      </div>
    )
  }
  const prog = done ? 100 : Math.max(0, Math.min(100, p.progress))
  const earnedEnd = p.start.getTime() + (prog / 100) * (p.end.getTime() - p.start.getTime())
  const varDays = Math.round((today.getTime() - earnedEnd) / dayMs) // >0 落後、<0 超前
  const late = done && p.actualEnd != null && p.actualEnd.getTime() > p.end.getTime()
  const lateDays = late ? Math.round((p.actualEnd!.getTime() - p.end.getTime()) / dayMs) : 0
  const toDeadline = Math.round((p.end.getTime() - today.getTime()) / dayMs) // >0 剩餘、<0 已過
  const barColor = done ? 'bg-emerald-500' : v.key === 'overdue' ? 'bg-amber-500' : v.key === 'todo' ? 'bg-slate-400' : 'bg-blue-500'
  const sched = done ? null : varDays > 1 ? { t: `落後約 ${varDays} 天`, c: 'text-amber-600 dark:text-amber-400' } : varDays < -1 ? { t: `超前約 ${-varDays} 天`, c: 'text-emerald-600 dark:text-emerald-400' } : { t: '準時', c: 'text-muted-foreground' }
  return (
    <div className="space-y-1.5 min-w-[190px]">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold">{p.name}</span>
        {isBottleneck && <span className="text-[10px] px-1 rounded bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400">⚠ 瓶頸</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className={cn('h-full rounded-full', barColor)} style={{ width: `${prog}%` }} /></div>
        <span className="tabular-nums text-[11px] font-medium w-8 text-right">{prog}%</span>
      </div>
      <div className="text-muted-foreground tabular-nums">規劃 {fmtDate(p.start)} ~ {fmtDate(p.end)}（{days} 天）</div>
      <div className="flex items-center gap-1 flex-wrap">
        <span>狀態：{done ? (late ? `已完成 · 遲 ${lateDays} 天` : '已完成') : v.label}</span>
        {sched && <span className={sched.c}>· {sched.t}</span>}
      </div>
      {!done && <div className="text-muted-foreground">截止：{toDeadline >= 0 ? `距今 ${toDeadline} 天` : <span className="text-amber-600 dark:text-amber-400">已逾期 {-toDeadline} 天</span>}</div>}
      {late && <div className="text-red-600 dark:text-red-400 tabular-nums">實際完成 {fmtDate(p.actualEnd!)}（晚於規劃截止）</div>}
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

type Phase = { id: string; name: string; status: Milestone['status']; progress: number; start: Date; end: Date; lane: number; actualEnd: Date | null }

type Health = { actualPct: number; expectedPct: number; varianceDays: number; status: 'ahead' | 'behind' | 'ontrack' }

type PhaseModel = {
  phases: Phase[]; laneCount: number; pct: (d: Date) => number
  months: { left: number; width: number; label: string; year: number }[]
  years: { left: number; width: number; year: number }[]
  /** 聚焦單一階段、區間夠短時改用的「天」刻度；空陣列代表仍用月刻度 */
  dayTicks: { left: number; label: string }[]
  todayInRange: boolean; todayPct: number
  health: Health; bottleneckId: string | null
  /** 全部階段（不受聚焦影響），供標題統計與聚焦選單用 */
  allPhases: { id: string; name: string; status: string }[]
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
  // 要在長條上標出日期的任務；markerSource 決定標在計畫列、實際列或兩列。
  //   由當責勾選、存在同一份設定檔裡——主管不必自己設定，進來就是當責整理好的畫面。
  const [markers, setMarkers] = useState<Set<string>>(new Set())
  const [markerSource, setMarkerSource] = useState<'plan' | 'actual' | 'both'>('actual')
  // 展開時間軸時的月寬。階段擠在一起時標記會疊住，放寬就拉得開。
  const [zoom, setZoom] = useState<'sm' | 'md' | 'lg'>('sm')
  // 聚焦某個階段：時間軸收斂到該階段區間、刻度改用「天」。
  //   這是當下想看細節的臨時操作，不存進設定檔（存了會害主管一進來只看到一段）。
  const [focusId, setFocusId] = useState<string | null>(null)

  // 載入（所有檢視者都套用 A 存好的設定）
  useEffect(() => {
    let alive = true
    fetch(`/api/projects/${project.id}/phase-overview`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { mode: string; hidden: string[]; axis?: string; markers?: string[]; markerSource?: string; zoom?: string }) => {
        if (!alive) return
        setMode(d.mode === 'merge' ? 'merge' : 'separate')
        setHidden(new Set(Array.isArray(d.hidden) ? d.hidden : []))
        setAxis(d.axis === 'timeline' ? 'timeline' : 'fit')
        setMarkers(new Set(Array.isArray(d.markers) ? d.markers : []))
        setMarkerSource(d.markerSource === 'plan' || d.markerSource === 'both' ? d.markerSource : 'actual')
        setZoom(d.zoom === 'md' || d.zoom === 'lg' ? d.zoom : 'sm')
      })
      .catch(() => { /* 用預設 */ })
    return () => { alive = false }
  }, [project.id])

  // 只有 A / pm / admin「主動變更」才寫回後端（純事件觸發，載入不會呼叫）
  const persist = (next: Partial<{
    mode: 'separate' | 'merge'; hidden: Set<string>; axis: 'fit' | 'timeline'
    markers: Set<string>; markerSource: 'plan' | 'actual' | 'both'; zoom: 'sm' | 'md' | 'lg'
  }>) => {
    if (!canCurate || !user?.email) return
    fetch(`/api/projects/${project.id}/phase-overview`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-email': user.email },
      body: JSON.stringify({
        mode: next.mode ?? mode,
        hidden: [...(next.hidden ?? hidden)],
        axis: next.axis ?? axis,
        markers: [...(next.markers ?? markers)],
        markerSource: next.markerSource ?? markerSource,
        zoom: next.zoom ?? zoom,
      }),
    }).catch(() => { /* 忽略 */ })
  }
  const changeMode = (m: 'separate' | 'merge') => { setMode(m); persist({ mode: m }) }
  const changeAxis = (a: 'fit' | 'timeline') => { setAxis(a); persist({ axis: a }) }
  const setShown = (id: string, show: boolean) => {
    const s = new Set(hidden)
    if (show) s.delete(id); else s.add(id)
    setHidden(s); persist({ hidden: s })
  }
  const showAll = () => { setHidden(new Set()); persist({ hidden: new Set() }) }
  const toggleMarker = (taskId: string, on: boolean) => {
    const s = new Set(markers)
    if (on) s.add(taskId); else s.delete(taskId)
    setMarkers(s); persist({ markers: s })
  }
  const changeMarkerSource = (v: 'plan' | 'actual' | 'both') => { setMarkerSource(v); persist({ markerSource: v }) }
  const clearMarkers = () => { setMarkers(new Set()); persist({ markers: new Set() }) }
  const changeZoom = (z: 'sm' | 'md' | 'lg') => {
    // 放大只在「展開時間軸」下有意義。與其把按鈕變灰要人先去切另一個設定，
    //   不如按下去就幫他切——使用者的意圖本來就是「我要看得更清楚」。
    setZoom(z)
    if (z !== 'sm' && axis !== 'timeline') { setAxis('timeline'); persist({ zoom: z, axis: 'timeline' }) }
    else persist({ zoom: z })
  }

  const model = useMemo(() => {
    const ms = project.milestones.filter(m => !hidden.has(m.id))
    if (ms.length === 0) return null

    // 各里程碑「實際完成日」= 其底下已完成任務的最晚 completedAt（用來判斷是否遲交）
    const actualEndByMs = new Map<string, Date>()
    for (const t of (project.tasks || [])) {
      if (!t.completedAt) continue
      const d = parseDate(t.completedAt); if (!d) continue
      const cur = actualEndByMs.get(t.milestoneId)
      if (!cur || d > cur) actualEndByMs.set(t.milestoneId, d)
    }

    const projStart = parseDate(project.startDate) ?? parseDate(ms[0].dueDate)!
    const base: Omit<Phase, 'lane'>[] = []
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]
      const end = parseDate(m.dueDate)
      if (!end) continue
      let start = parseDate(m.startDate)
      if (!start) start = base.length > 0 ? base[base.length - 1].end : projStart
      if (start > end) start = end
      base.push({ id: m.id, name: m.name, status: m.status, progress: m.progress, start, end, actualEnd: actualEndByMs.get(m.id) ?? null })
    }
    if (base.length === 0) return null

    // 聚焦時只留該階段。其他階段會被軸裁成邊緣的碎片（看起來只是幾個箭頭尖角），
    //   讀不出是什麼，還把標記擠成一團——聚焦的語意本來就是「現在只看這一段」。
    const visible = focusId ? base.filter(p => p.id === focusId) : base
    if (visible.length === 0) return null

    // 分層：merge → 全部第 0 層（單列，重疊時互相覆蓋）；separate → 貪婪分層讓所有階段都看得到
    let laneCount = 1
    const phases: Phase[] = visible.map(p => ({ ...p, lane: 0 }))
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
    // 聚焦：軸只涵蓋該階段（前後各留 3 天，端點的標記才不會貼在邊緣切掉）
    const focused = focusId ? phases.find(p => p.id === focusId) : null
    const PAD = 3 * 86400000
    const minT = focused
      ? focused.start.getTime() - PAD
      : Math.min(projStart.getTime(), ...phases.map(p => p.start.getTime()))
    const maxT = focused
      ? Math.max(focused.end.getTime(), focused.actualEnd?.getTime() ?? 0) + PAD
      : Math.max(projEnd?.getTime() ?? 0, ...phases.map(p => p.end.getTime()))
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

    // 區間夠短就改用「天」刻度；太多天會擠爆，所以依長度決定每幾天一格
    const dayCount = Math.round(span / 86400000)
    //   聚焦時一律給日期刻度（階段動輒一兩百天，退回「月」就看不到想看的日子）
    const dayStep = dayCount <= 21 ? 1 : dayCount <= 45 ? 2 : dayCount <= 100 ? 7
      : focusId ? (dayCount <= 240 ? 14 : 30) : 0
    const dayTicks: { left: number; label: string }[] = []
    if (dayStep > 0) {
      const d0 = new Date(minT)
      const cursor = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()))
      while (cursor.getTime() <= maxT) {
        dayTicks.push({ left: pct(cursor), label: `${cursor.getUTCMonth() + 1}/${cursor.getUTCDate()}` })
        cursor.setUTCDate(cursor.getUTCDate() + dayStep)
      }
    }

    const todayInRange = today.getTime() >= minT && today.getTime() <= maxT
    const todayPct = today.getTime() >= maxT ? 100 : today.getTime() <= minT ? 0 : pct(today)


    // 整體時程健康：時間加權比較「實際完成%」vs「依今天時間軸應達%」。
    //   一律看「全部階段」——聚焦只是檢視範圍，不該讓標題變成「1/1 階段完成」。
    let totDur = 0, sumProg = 0, sumExp = 0
    for (const p of base) {
      const dur = Math.max(1, p.end.getTime() - p.start.getTime())
      totDur += dur
      sumProg += (Math.max(0, Math.min(100, p.progress)) / 100) * dur
      sumExp += Math.max(0, Math.min(1, (today.getTime() - p.start.getTime()) / dur)) * dur
    }
    const actualPct = totDur > 0 ? (sumProg / totDur) * 100 : 0
    const expectedPct = totDur > 0 ? (sumExp / totDur) * 100 : 0
    const varianceDays = Math.round(((expectedPct - actualPct) / 100) * (span / 86400000))
    const hStatus: Health['status'] = actualPct >= expectedPct + 1 ? 'ahead' : actualPct <= expectedPct - 1 ? 'behind' : 'ontrack'
    const health: Health = { actualPct: Math.round(actualPct), expectedPct: Math.round(expectedPct), varianceDays: Math.abs(varianceDays), status: hStatus }

    // 瓶頸：未完成且已開始的階段中，「earned 落後今天」最多者
    let bottleneckId: string | null = null, worstSlip = 0
    for (const p of base) {
      if (p.status === 'done' || p.start > today) continue
      const prog = Math.max(0, Math.min(1, p.progress / 100))
      const earned = p.start.getTime() + prog * (p.end.getTime() - p.start.getTime())
      const slip = today.getTime() - earned
      if (slip > worstSlip) { worstSlip = slip; bottleneckId = p.id }
    }

    return {
      phases, laneCount, pct, months, years, dayTicks, todayInRange, todayPct, health, bottleneckId,
      // 標題的「x/y 階段完成」看整個專案，與聚焦無關
      allPhases: base.map(p => ({ id: p.id, name: p.name, status: p.status })),
    }
  }, [project.milestones, project.tasks, project.startDate, project.endDate, today, mode, hidden, focusId])

  const doneCount = model?.allPhases.filter(p => p.status === 'done').length ?? 0
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
          <span className="text-xs text-muted-foreground">{doneCount}/{model?.allPhases.length ?? 0} 階段完成 · 整體 {project.progress}%</span>
          {model && (
            <span
              title={`實際完成 ${model.health.actualPct}%，依今天時間軸應達 ${model.health.expectedPct}%`}
              className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full border',
                model.health.status === 'behind' ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400'
                  : model.health.status === 'ahead' ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400')}>
              {model.health.status === 'behind' ? `落後約 ${model.health.varianceDays} 天`
                : model.health.status === 'ahead' ? `超前約 ${model.health.varianceDays} 天`
                  : '準時'}
            </span>
          )}
        </button>
        {canCurate && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border text-muted-foreground hover:bg-muted transition-colors">
                <SlidersHorizontal className="h-3.5 w-3.5" />顯示設定
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" collisionPadding={12} className="w-80 p-0 overflow-hidden" style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}>
              {/* 分三頁。原本四區直排，面板長到要一直捲，找設定比設定本身還久。 */}
              <Tabs defaultValue="layout" className="flex flex-col" style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}>
                <TabsList className="grid w-full grid-cols-3 rounded-none border-b bg-muted/40">
                  <TabsTrigger value="layout" className="text-xs">版面</TabsTrigger>
                  <TabsTrigger value="marks" className="text-xs">
                    日期標記{markers.size > 0 && <span className="ml-1 text-[10px] text-primary">{markers.size}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="phases" className="text-xs">顯示階段</TabsTrigger>
                </TabsList>

                <TabsContent value="layout" className="m-0 space-y-3 overflow-y-auto p-3.5">
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
                    <p className="text-xs text-muted-foreground">貼合：全部縮入畫面；展開時間軸：固定月寬、可橫向滑動（適合長專案）</p>
                  </div>
                  <div className="space-y-1.5 border-t pt-2.5">
                    <div className="text-xs font-semibold text-muted-foreground">放大倍率</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([['sm', '標準'], ['md', '放大'], ['lg', '最大']] as const).map(([v, label]) => (
                        <button key={v} onClick={() => changeZoom(v)}
                          className={cn('inline-flex items-center justify-center text-xs py-1.5 rounded-md border transition-colors',
                            zoom === v ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      拉開月寬，日期標記才不會擠在一起。選「放大」或「最大」會自動切換成展開時間軸、可橫向滑動。
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="marks" className="m-0 flex flex-col overflow-hidden p-0">
                  <div className="space-y-1.5 border-b p-3.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-muted-foreground">標記哪一種日期</div>
                      {markers.size > 0 && (
                        <button className="text-xs text-primary hover:underline" onClick={clearMarkers}>清除</button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([['actual', '實際完成'], ['plan', '計畫完成'], ['both', '兩者']] as const).map(([v, label]) => (
                        <button key={v} onClick={() => changeMarkerSource(v)}
                          className={cn('inline-flex items-center justify-center text-xs py-1.5 rounded-md border transition-colors',
                            markerSource === v ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      勾選的任務會在長條上標出日期。<span className="text-rose-600">紅色</span>＝實際完成、
                      <span className="text-slate-500">灰色</span>＝計畫完成。
                    </p>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto p-3.5 pt-2.5 space-y-2">
                    {project.milestones.filter(m => !hidden.has(m.id)).map(m => {
                      const ts = (project.tasks || []).filter(t => t.milestoneId === m.id && !t.parentId)
                      if (ts.length === 0) return null
                      return (
                        <div key={m.id}>
                          <div className="px-1 text-[11px] font-medium text-muted-foreground truncate">{m.name}</div>
                          {ts.map(t => (
                            <label key={t.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/60 cursor-pointer text-xs">
                              <Checkbox checked={markers.has(t.id)} onCheckedChange={c => toggleMarker(t.id, !!c)} />
                              <span className="truncate flex-1">{t.title}</span>
                              {!t.completedAt && <span className="shrink-0 text-[10px] text-muted-foreground">未完成</span>}
                            </label>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="phases" className="m-0 flex flex-col overflow-hidden p-0">
                  <div className="flex items-center justify-between border-b p-3.5 pb-2.5">
                    <div className="text-xs font-semibold text-muted-foreground">顯示哪些階段</div>
                    <button className="text-xs text-primary hover:underline" onClick={showAll}>全選</button>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto p-3.5 pt-2.5 space-y-0.5">
                    {project.milestones.map(m => (
                      <label key={m.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/60 cursor-pointer text-xs">
                        <Checkbox checked={!hidden.has(m.id)} onCheckedChange={(c) => setShown(m.id, !!c)} />
                        <span className="truncate">{m.name}</span>
                      </label>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {!collapsed && (!model ? (
        <div className="px-4 pb-4 text-sm text-muted-foreground text-center py-6">無可顯示的里程碑階段（請在「顯示設定」勾選）</div>
      ) : (
        <PhaseBody model={model} today={today} project={project} axis={axis} LABEL_W={LABEL_W} STAGE_LANE={STAGE_LANE} STAGE_SEG={STAGE_SEG} PLAN_LANE={PLAN_LANE} PLAN_SEG={PLAN_SEG} markers={markers} markerSource={markerSource} zoom={zoom} focusId={focusId} setFocusId={setFocusId} />
      ))}
    </div>
  )
}

function PhaseBody({ model, today, project, axis, LABEL_W, STAGE_LANE, STAGE_SEG, PLAN_LANE, PLAN_SEG, markers, markerSource, zoom, focusId, setFocusId }: {
  model: PhaseModel; today: Date; project: Project; axis: 'fit' | 'timeline'
  LABEL_W: string; STAGE_LANE: number; STAGE_SEG: number; PLAN_LANE: number; PLAN_SEG: number
  markers: Set<string>; markerSource: 'plan' | 'actual' | 'both'; zoom: 'sm' | 'md' | 'lg'
  focusId: string | null; setFocusId: (v: string | null) => void
}) {
  const { phases, laneCount, pct, months, years, dayTicks, todayInRange, todayPct, bottleneckId, allPhases } = model
  // 點里程碑 → 顯著顯示該階段（其餘變淡）；再點一次或點空白處取消
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const toggleSel = (id: string) => setSelectedId(s => s === id ? null : id)
  const dimCls = (id: string) => (selectedId && selectedId !== id ? 'opacity-20 saturate-50' : '')
  const stageH = laneCount * STAGE_LANE
  const planH = laneCount * PLAN_LANE
  // 展開時間軸：每月固定像素寬，讓內容超出容器 → 觸發橫向捲動、月份也放得下顯示
  const MONTH_PX = zoom === 'lg' ? 150 : zoom === 'md' ? 92 : 52
  const LABEL_PX = 64 // 對齊左側 w-14 標籤 + gap
  const trackPx = months.length * MONTH_PX // 定位區(flex-1)的實際像素寬
  const timelinePx = LABEL_PX + trackPx
  const showMonth = (mWidth: number) => axis === 'timeline' || mWidth > 3
  // 時間軸模式：只給 minWidth（不鎖 width）→ 內容比容器長時撐開捲動、比容器短時仍填滿容器不縮水
  const innerStyle = { minWidth: axis === 'timeline' ? timelinePx : 720 }
  // 階段/Plan 的最小寬：貼合模式用百分比(避免細到看不見)；時間軸模式改用固定像素→短階段不被灌大
  const minStagePct = axis === 'timeline' ? (18 / trackPx) * 100 : 4
  const minPlanPct = axis === 'timeline' ? (16 / trackPx) * 100 : 3

  /**
   * 勾選任務的日期標記。放在長條上緣，hover 才顯示任務名與日期——
   * 一個階段可能被勾好幾個任務，全部直接印文字會互相疊住。
   */
  const markPoints = useMemo(() => {
    if (markers.size === 0) return []
    const laneOf = new Map(phases.map(p => [p.id, p.lane]))
    const out: { key: string; lane: number; at: Date; title: string; kind: 'plan' | 'actual' }[] = []
    for (const t of (project.tasks || [])) {
      if (!markers.has(t.id)) continue
      const lane = t.milestoneId ? laneOf.get(t.milestoneId) : undefined
      if (lane == null) continue // 該里程碑被隱藏或不在範圍內
      if (markerSource !== 'plan') {
        const d = parseDate(t.completedAt)
        if (d) out.push({ key: `${t.id}-a`, lane, at: d, title: t.title, kind: 'actual' })
      }
      if (markerSource !== 'actual') {
        const d = parseDate(t.endDate)
        if (d) out.push({ key: `${t.id}-p`, lane, at: d, title: t.title, kind: 'plan' })
      }
    }
    return out
  }, [markers, markerSource, project.tasks, phases])

  const Markers = ({ kind, laneH }: { kind: 'plan' | 'actual'; laneH: number }) => {
    // 同一列的標記依位置排序，標籤輪流上下錯開——日期緊鄰時才不會疊成一團。
    const pts = markPoints.filter(m => m.kind === kind)
      .map(m => ({ ...m, x: pct(m.at) }))
      .sort((a, b) => a.lane - b.lane || a.x - b.x)
    const seenInLane = new Map<number, number>()
    return (
      <>
        {pts.map(m => {
          const n = (seenInLane.get(m.lane) ?? 0); seenInLane.set(m.lane, n + 1)
          const flip = n % 2 === 1          // 偶數在上、奇數在下
          const md = `${m.at.getMonth() + 1}/${m.at.getDate()}`
          return (
            <Tooltip key={m.key}>
              <TooltipTrigger asChild>
                <div className="absolute z-30 -translate-x-1/2 cursor-default"
                  style={{ left: `${m.x}%`, top: m.lane * laneH - 4, height: laneH }}>
                  <div className={cn('mx-auto w-[3px] h-full rounded-full',
                    kind === 'actual' ? 'bg-rose-600' : 'bg-slate-500')} />
                  <div className={cn(
                    'absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold leading-none tabular-nums',
                    kind === 'actual' ? 'text-rose-600' : 'text-slate-500',
                    flip ? 'top-full mt-0.5' : 'bottom-full mb-0.5')}>
                    {md}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="font-semibold">{m.title}</div>
                <div className="text-muted-foreground">
                  {kind === 'actual' ? '實際完成' : '計畫完成'}　{m.at.toISOString().slice(0, 10)}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </>
    )
  }

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
        {/* 聚焦列：收斂到單一階段、刻度改成天。點階段長條會選取，這裡一鍵放大。 */}
        <div className="flex items-center gap-1.5 pb-1 flex-wrap">
          <span className="text-[11px] text-muted-foreground mr-0.5">聚焦階段</span>
          <button onClick={() => setFocusId(null)}
            className={cn('rounded-md border px-2 py-0.5 text-[11px] transition-colors',
              !focusId ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
            全部
          </button>
          {allPhases.map(p => (
            <button key={p.id} onClick={() => setFocusId(focusId === p.id ? null : p.id)}
              className={cn('rounded-md border px-2 py-0.5 text-[11px] transition-colors max-w-[160px] truncate',
                focusId === p.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground')}>
              {p.name}
            </button>
          ))}
        </div>

        {/* ① 階段 chevron — 聚焦時只剩一個階段，與下方 Plan 列完全重複，直接不畫 */}
        {!focusId && <div className="flex items-stretch gap-2">
          <div className={cn(LABEL_W, 'shrink-0 flex items-center text-[11px] font-semibold text-muted-foreground')}>階段</div>
          <div className="relative flex-1" style={{ height: stageH }}>
            {phases.map((p, i) => {
              const tone = phaseTone(p, today)
              const left = pct(p.start)
              const width = Math.max(pct(p.end) - left, minStagePct)
              const clip = arrowClip(i)
              const isBottleneck = p.id === bottleneckId
              return (
                <Tooltip key={p.id}>
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => toggleSel(p.id)}
                      className={cn('absolute cursor-pointer transition-opacity', tone.line, dimCls(p.id), selectedId === p.id && 'z-10')}
                      style={{ left: `${left}%`, width: `${width}%`, top: p.lane * STAGE_LANE, height: STAGE_SEG, clipPath: clip }}>
                      <div className={cn('absolute inset-[2px] flex items-center pr-3', i === 0 ? 'pl-2.5' : 'pl-4', tone.soft, tone.text)} style={{ clipPath: clip }}>
                        {/* 瓶頸只用紅色 ⚠ 標示，保留階段本身的狀態色（P3 仍是進行中藍，與其任務一致）*/}
                        <span className="text-xs font-semibold truncate">{isBottleneck && <span className="text-red-600 dark:text-red-400">⚠ </span>}{p.name}</span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <PhaseTip p={p} today={today} isBottleneck={isBottleneck} detailed={selectedId === p.id} />
                  </TooltipContent>
                </Tooltip>
              )
            })}
            <TodayLine height={stageH} />
          </div>
        </div>}

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
            {dayTicks.length > 0
              // 聚焦單一階段時改用「天」：看整年用月、看單一階段要看得到日期
              ? dayTicks.map((d, i) => (
                <div key={i} className="absolute top-0 h-5 flex items-center justify-center text-[10px] tabular-nums text-muted-foreground border-l border-border/40 -translate-x-1/2 px-1"
                  style={{ left: `${d.left}%` }}>{d.label}</div>
              ))
              : months.map((m, i) => (
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
                      onClick={() => toggleSel(p.id)}
                      className={cn('absolute cursor-pointer transition-opacity', tone.line, dimCls(p.id), selectedId === p.id && 'z-10')}
                      style={{ left: `${left}%`, width: `${width}%`, top: p.lane * PLAN_LANE, height: PLAN_SEG, clipPath: clip }}>
                      <div className={cn('absolute inset-[1.5px] flex items-center pr-3 bg-background', tone.text, i === 0 ? 'pl-2' : 'pl-4')} style={{ clipPath: clip }}>
                        <span className="text-[11px] font-semibold truncate">{p.name}</span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs"><PhaseTip p={p} today={today} isBottleneck={p.id === bottleneckId} detailed={selectedId === p.id} /></TooltipContent>
                </Tooltip>
              )
            })}
            <Markers kind="plan" laneH={PLAN_LANE} />
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
              // 遲交：已完成、且實際完成日晚於規劃截止 → 超出段標紅（100% 後仍看得出當初逾期）
              const late = done && p.actualEnd != null && p.actualEnd.getTime() > p.end.getTime()
              const lateDays = late ? Math.round((p.actualEnd!.getTime() - p.end.getTime()) / dayMs) : 0
              const varDays = Math.round((today.getTime() - earnedEnd.getTime()) / dayMs) // >0 落後、<0 超前
              const label = done ? (late ? `已完成 · 遲 ${lateDays} 天` : '已完成')
                : varDays > 0 ? `落後約 ${varDays} 天`
                  : varDays < 0 ? `超前約 ${-varDays} 天` : '準時'
              // 分段：實心 earned（藍/綠）＋ 落後(琥珀斜線)／超前(綠斜線)／遲交(紅斜線)
              const solidEnd = done ? p.end : (earnedEnd < today ? earnedEnd : today)
              const segs: { l: number; r: number; kind: 'earned' | 'behind' | 'ahead' | 'late' }[] = [
                { l: pct(p.start), r: pct(solidEnd), kind: 'earned' },
              ]
              if (done && late) segs.push({ l: pct(p.end), r: pct(p.actualEnd!), kind: 'late' })
              else if (!done && earnedEnd.getTime() > today.getTime()) segs.push({ l: pct(today), r: pct(earnedEnd), kind: 'ahead' })
              else if (!done && earnedEnd.getTime() < today.getTime()) segs.push({ l: pct(earnedEnd), r: pct(today), kind: 'behind' })
              const HATCH: Record<'behind' | 'ahead' | 'late', { border: string; bg: string }> = {
                behind: { border: 'border-amber-400', bg: 'repeating-linear-gradient(45deg, rgba(245,158,11,.28) 0 5px, transparent 5px 10px)' },
                ahead: { border: 'border-emerald-400', bg: 'repeating-linear-gradient(45deg, rgba(16,185,129,.30) 0 5px, transparent 5px 10px)' },
                late: { border: 'border-red-400', bg: 'repeating-linear-gradient(45deg, rgba(239,68,68,.32) 0 5px, transparent 5px 10px)' },
              }
              return (
                <Tooltip key={p.id}>
                  <TooltipTrigger asChild>
                    <div onClick={() => toggleSel(p.id)} className={cn('absolute cursor-pointer transition-opacity', dimCls(p.id), selectedId === p.id && 'z-10')} style={{ left: 0, right: 0, top, height: PLAN_SEG }}>
                      {segs.map((s, si) => s.kind === 'earned' ? (
                        <div key={si} className={cn('absolute h-full rounded-sm flex items-center', done ? 'bg-emerald-500' : 'bg-blue-500')}
                          style={{ left: `${s.l}%`, width: `${Math.max(s.r - s.l, 0.6)}%` }}>
                          {si === 0 && <span className="text-[11px] font-bold text-white truncate px-2">{p.name}</span>}
                        </div>
                      ) : (
                        <div key={si} className={cn('absolute h-full rounded-sm border border-dashed', HATCH[s.kind].border)}
                          style={{ left: `${s.l}%`, width: `${Math.max(s.r - s.l, 0.4)}%`, backgroundImage: HATCH[s.kind].bg }} />
                      ))}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <div className="space-y-0.5">
                      <div className="font-semibold">{p.name}</div>
                      <div className={cn(late ? 'text-red-600 dark:text-red-400 font-medium' : varDays > 0 && !done ? 'text-amber-600 dark:text-amber-400 font-medium' : varDays < 0 && !done ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground')}>完成度 {p.progress}% · {label}</div>
                      {done
                        ? <div className="tabular-nums text-muted-foreground">{late ? <>實際完成 {fmtDate(p.actualEnd!)}（規劃截止 {fmtDate(p.end)}）</> : <>規劃 {fmtDate(p.start)} ~ {fmtDate(p.end)}</>}</div>
                        : <div className="tabular-nums text-muted-foreground">實際完成到 {fmtDate(earnedEnd)}（今天 {fmtDate(today)}）</div>}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            })}
            <Markers kind="actual" laneH={PLAN_LANE} />
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
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border border-dashed border-amber-400" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(245,158,11,.28) 0 3px, transparent 3px 6px)' }} />落後（未達今天）</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border border-dashed border-emerald-400" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(16,185,129,.30) 0 3px, transparent 3px 6px)' }} />超前（超過今天）</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border border-dashed border-red-400" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(239,68,68,.32) 0 3px, transparent 3px 6px)' }} />遲交（晚於規劃截止）</span>
        <span className="inline-flex items-center gap-1"><span className="text-red-600 dark:text-red-400 font-semibold">⚠</span> 瓶頸（最落後）</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 bg-rose-500/70" style={{ clipPath: 'polygon(0 0,100% 50%,0 100%)' }} />今天</span>
      </div>
    </div>
    </TooltipProvider>
  )
}
