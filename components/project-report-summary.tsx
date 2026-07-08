'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { Project, TaskStatus } from '@/lib/mock-data'
import {
  CheckCircle2, Clock, AlertTriangle, ShieldAlert, CalendarClock,
  Flag, ArrowRight, ListChecks, Loader2, Ban, ChevronLeft, ChevronRight,
  MessageSquare, Paperclip, Image as ImageIcon,
} from 'lucide-react'

// ── helpers ──
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function weekStartOf(ymd: string) {
  const d = new Date(ymd)
  const dow = d.getDay()
  const m = new Date(d)
  m.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return toYMD(m)
}
function isoWeek(ymd: string): number {
  const dt = new Date(ymd)
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
function weekRange(weekStart: string) {
  const m = new Date(weekStart)
  const s = new Date(m)
  s.setDate(m.getDate() + 6)
  return `${m.getMonth() + 1}/${m.getDate()}–${s.getMonth() + 1}/${s.getDate()}`
}
function fmtDate(s?: string) {
  if (!s) return '—'
  const d = new Date(s)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const PROJECT_STATUS_META: Record<string, { label: string; dot: string; text: string; ring: string }> = {
  green: { label: '正常', dot: 'bg-emerald-500', text: 'text-emerald-600', ring: 'ring-emerald-500/30' },
  yellow: { label: '需注意', dot: 'bg-amber-500', text: 'text-amber-600', ring: 'ring-amber-500/30' },
  red: { label: '有風險', dot: 'bg-red-500', text: 'text-red-600', ring: 'ring-red-500/30' },
}
const TASK_STATUS_BAR: Record<TaskStatus, string> = {
  done: 'bg-emerald-500',
  'in-progress': 'bg-blue-500',
  blocked: 'bg-red-500',
  todo: 'bg-slate-300',
}

export function ProjectReportSummary({
  project,
  presentation = false,
}: {
  project: Project
  presentation?: boolean
}) {
  const sm = presentation

  // ── current-state base (independent of selected week) ──
  const base = useMemo(() => {
    const today = new Date()
    const todayStr = toYMD(today)
    const currentWeek = weekStartOf(todayStr)

    const parentIds = new Set(project.tasks.filter(t => t.parentId).map(t => t.parentId as string))
    const leaf = project.tasks.filter(t => !parentIds.has(t.id))
    const taskMap = new Map(project.tasks.map(t => [t.id, t]))
    const msName = new Map(project.milestones.map(m => [m.id, m.name]))

    const blocked = leaf.filter(t => t.status === 'blocked')
    const blockedByMsMap = new Map<string, number>()
    for (const t of blocked) blockedByMsMap.set(t.milestoneId, (blockedByMsMap.get(t.milestoneId) || 0) + 1)
    const blockedByMs = [...blockedByMsMap.entries()]
      .map(([id, count]) => ({ name: msName.get(id) || '其他', count }))
      .sort((a, b) => b.count - a.count)
    const overdue = leaf.filter(t => t.status !== 'done' && t.status !== 'blocked' && t.endDate < todayStr)
    const openRisks = project.risks.filter(r => r.status === 'open')
    const pendingDelays = project.delayRequests.filter(dr => dr.status === 'pending')

    const milestones = project.milestones.map(m => ({
      id: m.id, name: m.name, status: m.status, progress: m.progress, dueDate: m.dueDate,
      overdue: m.status !== 'done' && m.dueDate < todayStr,
    }))
    const end = new Date(project.endDate)
    const remainingDays = Math.ceil((end.getTime() - today.getTime()) / 86400000)

    // 更新紀錄只放「A 已發布」的紀錄（publishedAt 有值）；R 未經 A 審核發布的不進更新紀錄
    const publishedLogs = project.taskLogs.filter(l => l.publishedAt)
    // available weeks = current week ∪ weeks with logs ∪ weeks with completions
    const weekSet = new Set<string>([currentWeek])
    for (const l of publishedLogs) weekSet.add(weekStartOf(l.logDate))
    for (const t of leaf) if (t.completedAt) weekSet.add(weekStartOf(t.completedAt.slice(0, 10)))
    const logCountByWeek = new Map<string, number>()
    for (const l of publishedLogs) {
      const w = weekStartOf(l.logDate)
      logCountByWeek.set(w, (logCountByWeek.get(w) || 0) + 1)
    }
    const weeks = [...weekSet].sort().map(w => ({
      start: w, week: isoWeek(w), range: weekRange(w), logs: logCountByWeek.get(w) || 0, isCurrent: w === currentWeek,
    }))

    return {
      todayStr, currentWeek, leaf, taskMap, msName,
      blocked, blockedByMs, overdue, openRisks, pendingDelays,
      milestones, remainingDays,
      doneMs: milestones.filter(m => m.status === 'done').length, totalMs: milestones.length,
      doneTasks: leaf.filter(t => t.status === 'done').length, totalTasks: leaf.length,
      weeks,
    }
  }, [project])

  const [selectedWeek, setSelectedWeek] = useState(base.currentWeek)
  // keep selection valid if project changes
  useEffect(() => { setSelectedWeek(base.currentWeek) }, [base.currentWeek])

  // ── data for the selected week ──
  const wk = useMemo(() => {
    const start = selectedWeek
    const endD = new Date(start); endD.setDate(endD.getDate() + 6)
    const endStr = toYMD(endD)

    const completed = base.leaf.filter(
      t => t.completedAt && t.completedAt.slice(0, 10) >= start && t.completedAt.slice(0, 10) <= endStr
    )
    const logs = project.taskLogs.filter(l => l.publishedAt && l.logDate >= start && l.logDate <= endStr)

    // group logs by author → entries
    const byAuthor = new Map<string, { task: ReturnType<typeof base.taskMap.get>; log: (typeof logs)[number] }[]>()
    for (const l of [...logs].sort((a, b) => b.logDate.localeCompare(a.logDate))) {
      const arr = byAuthor.get(l.author) || []
      arr.push({ task: base.taskMap.get(l.taskId), log: l })
      byAuthor.set(l.author, arr)
    }
    const authors = [...byAuthor.entries()]
      .map(([name, entries]) => ({ name, entries, taskCount: new Set(entries.map(e => e.log.taskId)).size }))
      .sort((a, b) => b.entries.length - a.entries.length)

    const nextPlans = logs
      .flatMap(l => (l.nextPlans || []).map(np => ({ content: np.content, date: np.date, author: l.author })))
      .filter(np => np.content?.trim())

    return { start, endStr, completed, logs, authors, nextPlans, reportedCount: byAuthor.size }
  }, [selectedWeek, base, project.taskLogs])

  const statusMeta = PROJECT_STATUS_META[project.status] || PROJECT_STATUS_META.green
  const attentionCount = base.blocked.length + base.overdue.length + base.openRisks.length + base.pendingDelays.length

  // scroll selected week into view in the strip
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-selected="true"]') as HTMLElement | null
    el?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selectedWeek])

  const selIdx = base.weeks.findIndex(w => w.start === selectedWeek)
  const step = (dir: number) => {
    const next = base.weeks[selIdx + dir]
    if (next) setSelectedWeek(next.start)
  }

  return (
    <div className={cn('space-y-5', sm && 'space-y-7')}>
      {/* ① 健康抬頭 */}
      <div className={cn('rounded-xl border bg-card px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3 ring-1', statusMeta.ring)}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn('h-3 w-3 rounded-full shrink-0', statusMeta.dot)} />
          <div className="min-w-0">
            <div className={cn('font-bold truncate', sm ? 'text-2xl' : 'text-lg')}>{project.name}</div>
            <div className={cn('text-muted-foreground', sm ? 'text-sm' : 'text-xs')}>
              {project.projectCode}{project.projectTier ? ` · ${project.projectTier}` : ''} · 狀態 <span className={statusMeta.text}>{statusMeta.label}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6 ml-auto">
          <Metric big={sm} label="整體進度" value={`${project.progress}%`} />
          <Metric big={sm} label="里程碑" value={`${base.doneMs}/${base.totalMs}`} />
          <Metric big={sm} label="任務" value={`${base.doneTasks}/${base.totalTasks}`} />
          <Metric big={sm} label="距結案" value={base.remainingDays >= 0 ? `${base.remainingDays} 天` : `逾 ${-base.remainingDays} 天`} danger={base.remainingDays < 0} />
        </div>
      </div>

      {/* ② 里程碑進度總覽 */}
      <Section title="里程碑進度總覽" icon={<Flag className="h-4 w-4" />} big={sm}>
        <div className="space-y-2.5">
          {base.milestones.map((m, i) => (
            <div key={m.id} className="flex items-center gap-3">
              <span className={cn('shrink-0 inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold', sm ? 'h-7 w-7 text-sm' : 'h-6 w-6 text-xs')}>{i + 1}</span>
              <div className={cn('shrink-0 font-medium truncate', sm ? 'w-64 text-base' : 'w-48 text-sm')}>{m.name}</div>
              <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', TASK_STATUS_BAR[m.status as TaskStatus] || 'bg-slate-300')} style={{ width: `${m.progress}%` }} />
              </div>
              <span className={cn('shrink-0 text-right tabular-nums text-muted-foreground', sm ? 'w-12 text-sm' : 'w-10 text-xs')}>{m.progress}%</span>
              <span className={cn('shrink-0 text-right text-muted-foreground', sm ? 'w-16 text-sm' : 'w-12 text-xs')}>{fmtDate(m.dueDate)}</span>
              <span className={cn('shrink-0 w-16', sm ? 'text-sm' : 'text-xs')}>
                {m.status === 'done' ? <span className="text-emerald-600">✓ 完成</span>
                  : m.overdue ? <span className="text-red-600 font-medium">⚠ 逾期</span>
                  : <span className="text-muted-foreground">進行中</span>}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 週次導覽 ── */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <button onClick={() => step(-1)} disabled={selIdx <= 0} className="shrink-0 p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft className="h-4 w-4" /></button>
          <div ref={stripRef} className="flex-1 flex gap-1.5 overflow-x-auto scrollbar-thin py-0.5">
            {base.weeks.map(w => {
              const selected = w.start === selectedWeek
              return (
                <button
                  key={w.start}
                  data-selected={selected}
                  onClick={() => setSelectedWeek(w.start)}
                  className={cn(
                    'shrink-0 rounded-lg border px-2.5 py-1.5 text-center transition-colors min-w-[64px]',
                    selected ? 'border-primary bg-primary/10 text-primary' : 'border-transparent hover:bg-muted text-muted-foreground'
                  )}
                >
                  <div className={cn('font-semibold leading-tight', sm ? 'text-sm' : 'text-xs')}>W{w.week}{w.isCurrent && <span className="ml-1 text-[10px] font-normal">本週</span>}</div>
                  <div className="text-[10px] leading-tight opacity-80">{w.range}</div>
                  {w.logs > 0 && <div className={cn('mt-0.5 inline-block rounded-full px-1.5 text-[10px] leading-tight', selected ? 'bg-primary/20' : 'bg-muted')}>{w.logs} 筆</div>}
                </button>
              )
            })}
          </div>
          <button onClick={() => step(1)} disabled={selIdx >= base.weeks.length - 1} className="shrink-0 p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"><ChevronRight className="h-4 w-4" /></button>
        </div>

        {/* 雙欄:本期重點 / 工作週報內容 */}
        <div className="grid lg:grid-cols-2 gap-px bg-border">
          {/* 本期完成 + 下一步 */}
          <div className="bg-card px-5 py-4 space-y-4">
            <div>
              <div className={cn('flex items-center gap-1.5 font-medium text-emerald-600 mb-2', sm ? 'text-base' : 'text-sm')}>
                <CheckCircle2 className="h-4 w-4" /> 本期完成 {wk.completed.length} 項
              </div>
              {wk.completed.length === 0 ? (
                <p className={cn('text-muted-foreground', sm ? 'text-base' : 'text-sm')}>本週無完成項目</p>
              ) : (
                <ul className="space-y-1">
                  {wk.completed.map(t => (
                    <li key={t.id} className={cn('flex items-start gap-2', sm ? 'text-base' : 'text-sm')}>
                      <span className="text-emerald-500 mt-0.5">✓</span>
                      <span className="flex-1 min-w-0"><span>{t.title}</span><span className="text-muted-foreground"> · {t.assignee}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {wk.nextPlans.length > 0 && (
              <div>
                <div className={cn('flex items-center gap-1.5 font-medium text-foreground mb-2', sm ? 'text-base' : 'text-sm')}>
                  <ArrowRight className="h-4 w-4" /> 下一步 / 下週計畫
                </div>
                <ul className="space-y-1">
                  {wk.nextPlans.map((np, i) => (
                    <li key={i} className={cn('flex items-start gap-2', sm ? 'text-base' : 'text-sm')}>
                      <ArrowRight className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />
                      <span className="flex-1 min-w-0">{np.content}<span className="text-xs text-muted-foreground"> · {np.author}{np.date ? ` (${fmtDate(np.date)})` : ''}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 工作週報內容 */}
          <div className="bg-card px-5 py-4">
            <div className={cn('flex items-center gap-1.5 font-medium mb-2', sm ? 'text-base' : 'text-sm')}>
              <MessageSquare className="h-4 w-4" /> 工作週報內容
              <span className="text-xs text-muted-foreground font-normal">{wk.reportedCount} 人 · {wk.logs.length} 筆</span>
            </div>
            {wk.authors.length === 0 ? (
              <p className={cn('text-muted-foreground py-4', sm ? 'text-base' : 'text-sm')}>本週尚無人填寫週報</p>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {wk.authors.map(a => (
                  <div key={a.name}>
                    <div className={cn('font-medium mb-1', sm ? 'text-base' : 'text-sm')}>{a.name} <span className="text-xs text-muted-foreground font-normal">{a.taskCount} 項任務</span></div>
                    <ul className="space-y-1.5 pl-1 border-l-2 border-muted">
                      {a.entries.map(({ task, log }) => (
                        <li key={log.id} className="pl-2.5">
                          <div className="flex items-baseline gap-2">
                            <span className={cn('font-medium truncate', sm ? 'text-sm' : 'text-xs')}>{task?.title || '（任務）'}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{log.logDate.slice(5).replace('-', '/')}</span>
                          </div>
                          <div className={cn('text-muted-foreground whitespace-pre-wrap', sm ? 'text-sm' : 'text-xs')}>{log.content}</div>
                          {log.attachments && log.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {log.attachments.map((att, i) => (
                                <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" title={att.name} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded px-1.5 py-0.5 transition-colors">
                                  {att.type === 'image' ? <ImageIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />}
                                  <span className="truncate max-w-[160px]">{att.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ④ 需要注意（目前狀態） */}
      <Section title="需要注意" icon={<ShieldAlert className="h-4 w-4" />} sub={attentionCount > 0 ? `${attentionCount} 項 · 目前狀態` : '目前狀態'} danger={attentionCount > 0} big={sm}>
        {attentionCount === 0 ? (
          <p className={cn('text-emerald-600 py-6 text-center flex items-center justify-center gap-2', sm ? 'text-base' : 'text-sm')}>
            <CheckCircle2 className="h-4 w-4" /> 目前無待處理風險項目
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {base.blocked.length > 0 && (
              <AttnGroup icon={<Ban className="h-4 w-4" />} color="text-red-600" label="受阻" big={sm}
                byMilestone={base.blockedByMs}
                items={base.blocked.map(t => ({ key: t.id, title: t.title, meta: base.msName.get(t.milestoneId) || '' }))} />
            )}
            {base.overdue.length > 0 && (
              <AttnGroup icon={<Clock className="h-4 w-4" />} color="text-amber-600" label="逾期" big={sm}
                items={base.overdue.map(t => {
                  const days = Math.ceil((new Date(base.todayStr).getTime() - new Date(t.endDate).getTime()) / 86400000)
                  return { key: t.id, title: t.title, meta: `${t.assignee} · 逾 ${days} 天` }
                })} />
            )}
            {base.openRisks.length > 0 && (
              <AttnGroup icon={<AlertTriangle className="h-4 w-4" />} color="text-orange-600" label="風險" big={sm}
                items={base.openRisks.map(r => ({ key: r.id, title: r.title, meta: `影響 ${r.impact === 'high' ? '高' : r.impact === 'medium' ? '中' : '低'}` }))} />
            )}
            {base.pendingDelays.length > 0 && (
              <AttnGroup icon={<CalendarClock className="h-4 w-4" />} color="text-purple-600" label="待審延期" big={sm}
                items={base.pendingDelays.map(dr => ({ key: dr.id, title: dr.taskTitle || dr.reason || '延期申請', meta: dr.requestedBy ? `申請人 ${dr.requestedBy}` : '' }))} />
            )}
          </div>
        )}
      </Section>
    </div>
  )
}

// ── sub-components ──
function Metric({ label, value, danger, big }: { label: string; value: string; danger?: boolean; big?: boolean }) {
  return (
    <div className="text-center">
      <div className={cn('font-bold tabular-nums', danger ? 'text-red-600' : '', big ? 'text-2xl' : 'text-lg')}>{value}</div>
      <div className={cn('text-muted-foreground', big ? 'text-sm' : 'text-xs')}>{label}</div>
    </div>
  )
}

function Section({ title, icon, sub, danger, big, children }: {
  title: string; icon?: React.ReactNode; sub?: string; danger?: boolean; big?: boolean; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className={cn('flex items-center gap-2 border-b px-5 py-3', danger && 'text-red-600')}>
        {icon}
        <h3 className={cn('font-semibold', big ? 'text-lg' : 'text-sm')}>{title}</h3>
        {sub && <span className={cn('ml-auto text-muted-foreground', danger && 'text-red-600 font-medium', big ? 'text-sm' : 'text-xs')}>{sub}</span>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function AttnGroup({ icon, color, label, items, byMilestone, big, cap = 5 }: {
  icon: React.ReactNode; color: string; label: string
  items: { key: string; title: string; meta?: string }[]
  byMilestone?: { name: string; count: number }[]
  big?: boolean; cap?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, cap)
  const rest = items.length - shown.length
  return (
    <div>
      <div className={cn('flex items-center gap-1.5 font-medium mb-1', color, big ? 'text-base' : 'text-sm')}>{icon} {label} {items.length}</div>
      {byMilestone && byMilestone.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5 pl-1">
          {byMilestone.map(m => (
            <span key={m.name} className={cn('inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 px-2 py-0.5 dark:bg-red-950/40 dark:text-red-300', big ? 'text-sm' : 'text-xs')}>{m.name} <b className="tabular-nums">{m.count}</b></span>
          ))}
        </div>
      )}
      <ul className="space-y-1 pl-1">{shown.map(it => <AttnRow key={it.key} big={big} title={it.title} meta={it.meta} />)}</ul>
      {items.length > cap && (
        <button onClick={() => setExpanded(e => !e)} className={cn('pl-3 mt-1 text-muted-foreground hover:text-foreground transition-colors', big ? 'text-sm' : 'text-xs')}>
          {expanded ? '收起 ▴' : `還有 ${rest} 項 ▾`}
        </button>
      )}
    </div>
  )
}

function AttnRow({ title, meta, big }: { title: string; meta?: string; big?: boolean }) {
  return (
    <li className={cn('flex items-baseline gap-2', big ? 'text-base' : 'text-sm')}>
      <span className="text-muted-foreground">•</span>
      <span className="flex-1 min-w-0 truncate">{title}</span>
      {meta && <span className="text-xs text-muted-foreground shrink-0">{meta}</span>}
    </li>
  )
}
