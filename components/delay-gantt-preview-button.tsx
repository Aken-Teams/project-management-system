'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { BarChart3, Loader2, User } from 'lucide-react'
import type { Task, Milestone } from '@/lib/mock-data'

/**
 * 審核者(S)用的「延期影響」樹狀對比視覺（按鈕彈開）。
 * 里程碑畫成「有起訖的長條」(起點=它最早任務開始)，任務落在里程碑範圍內。
 * 灰＝原定；紅＝延期(工期延長，起點不變、結束延後)；琥珀＝順延(整條平移)。
 * 顏色用「有沒有 startDate」判斷（無=延期、有=順延）。模型見 memory/delay-cascade-model。
 */
interface DelayInfo {
  projectId: string
  affectedMilestones: { milestoneId: string; milestoneName?: string; originalDate: string; proposedDate: string }[]
  pendingTaskChanges?: { taskId: string; taskTitle: string; startDate?: string; endDate?: string }[]
}

interface TaskNode { name: string; breadcrumb: string; assignee: string; kind: 'extend' | 'shift'; origStart: number; origEnd: number; newStart: number; newEnd: number; delta: number; depth: number }
interface MsNode { name: string; origStart: number; origDue: number; newDue: number; delta: number; delayed: boolean; tasks: TaskNode[] }

const DAY = 86400000
const t = (d: string) => new Date(d).getTime()
const fmt = (ms: number) => new Date(ms).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })

export function DelayGanttPreviewButton({ delay }: { delay: DelayInfo }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tree, setTree] = useState<MsNode[]>([])
  const [error, setError] = useState(false)

  const load = async () => {
    setOpen(true)
    if (tree.length) return
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/projects/${delay.projectId}`)
      if (!res.ok) throw new Error()
      const proj = await res.json()
      const allTasks: Task[] = proj.tasks || []
      const taskById = new Map<string, Task>(allTasks.map(x => [x.id, x]))

      const ancestorsOf = (task: Task) => {
        const parts: string[] = []
        let cur: Task | undefined = task.parentId ? taskById.get(task.parentId) : undefined
        const seen = new Set<string>()
        while (cur && !seen.has(cur.id)) { seen.add(cur.id); parts.unshift(cur.title); cur = cur.parentId ? taskById.get(cur.parentId) : undefined }
        return parts
      }

      const byMs = new Map<string, TaskNode[]>()
      for (const tc of (delay.pendingTaskChanges || [])) {
        const cur = taskById.get(tc.taskId)
        if (!cur) continue
        const anc = ancestorsOf(cur)
        const kind: 'extend' | 'shift' = tc.startDate ? 'shift' : 'extend'
        const node: TaskNode = {
          name: tc.taskTitle, breadcrumb: anc.join(' › '), assignee: cur.assignee || '未指派', kind,
          origStart: t(cur.startDate), origEnd: t(cur.endDate),
          newStart: tc.startDate ? t(tc.startDate) : t(cur.startDate),
          newEnd: tc.endDate ? t(tc.endDate) : t(cur.endDate),
          delta: Math.round(((tc.endDate ? t(tc.endDate) : t(cur.endDate)) - t(cur.endDate)) / DAY),
          depth: anc.length,
        }
        const arr = byMs.get(cur.milestoneId) || []
        arr.push(node); byMs.set(cur.milestoneId, arr)
      }
      for (const arr of byMs.values()) arr.sort((a, b) => a.depth - b.depth || a.origStart - b.origStart)

      const out: MsNode[] = delay.affectedMilestones.map(am => {
        const o = t(am.originalDate), n = t(am.proposedDate)
        // 里程碑起點＝它最早任務的開始（畫成長條，讓任務落在範圍內）
        const msTasks = allTasks.filter(x => x.milestoneId === am.milestoneId)
        const msStart = msTasks.length ? Math.min(...msTasks.map(x => t(x.startDate))) : o
        const tasks = byMs.get(am.milestoneId) || []
        return { name: am.milestoneName || proj.milestones?.find((m: Milestone) => m.id === am.milestoneId)?.name || '里程碑', origStart: Math.min(msStart, o), origDue: o, newDue: n, delta: Math.round((n - o) / DAY), delayed: tasks.some(tk => tk.kind === 'extend'), tasks }
      })
      setTree(out)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const allTimes = tree.flatMap(m => [m.origStart, m.origDue, m.newDue, ...m.tasks.flatMap(tk => [tk.origStart, tk.origEnd, tk.newStart, tk.newEnd])])
  const min = allTimes.length ? Math.min(...allTimes) : 0
  const max = allTimes.length ? Math.max(...allTimes) : 1
  const span = max - min || DAY
  const pct = (ms: number) => ((ms - min) / span) * 100
  const w = (a: number, b: number) => Math.max(((b - a) / span) * 100, 1)

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
        <BarChart3 className="h-4 w-4 text-blue-500" />查看延期影響
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-500" />延期影響</DialogTitle>
            <DialogDescription className="flex items-center gap-3 flex-wrap text-xs">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-slate-300" />原定</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-red-400" />延期（工期延長）</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-amber-400" />順延（平移）</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />載入中…</div>
            ) : error || tree.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">此延期無可視化的日期變更。</div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-right text-[11px] text-muted-foreground tabular-nums pr-24">時間軸範圍　{fmt(min)} ~ {fmt(max)}</div>
                <div className="rounded-lg border divide-y">
                  {tree.map((m, mi) => {
                    const shift = m.newDue - m.origDue
                    return (
                      <div key={mi}>
                        {/* 里程碑列（長條：原定範圍 + 延長/平移段） */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                          <div className="w-40 shrink-0 min-w-0 text-sm font-semibold truncate flex items-center gap-1.5">
                            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${m.delayed ? 'bg-red-500' : 'bg-amber-500'}`} />{m.name}
                          </div>
                          <div className="flex-1 relative h-5 min-w-0">
                            {/* 原定範圍（灰） */}
                            <div className="absolute h-3 bg-slate-300 rounded-l-sm" style={{ top: 4, left: `${pct(m.origStart)}%`, width: `${w(m.origStart, m.origDue)}%` }} />
                            {shift > 0 && (m.delayed
                              ? <div className="absolute h-3 bg-red-400 rounded-r-sm" style={{ top: 4, left: `${pct(m.origDue)}%`, width: `${w(m.origDue, m.newDue)}%` }} />
                              : <div className="absolute h-3 bg-amber-400 rounded-sm" style={{ top: 4, left: `${pct(m.origStart + shift)}%`, width: `${w(m.origStart, m.origDue)}%` }} />
                            )}
                          </div>
                          <div className="w-24 shrink-0 text-right text-[11px] tabular-nums leading-tight">
                            <div className="whitespace-nowrap"><span className="text-slate-400">{fmt(m.origDue)}</span><span className="mx-0.5 text-muted-foreground">→</span><span className={`font-medium ${m.delayed ? 'text-red-500' : 'text-amber-600'}`}>{fmt(m.newDue)}</span></div>
                            {m.delta !== 0 && <div className={m.delayed ? 'text-red-500' : 'text-amber-600'}>{m.delta > 0 ? '+' : ''}{m.delta}天</div>}
                          </div>
                        </div>
                        {/* 底下掛的變更任務 */}
                        {m.tasks.map((tk, ti) => (
                          <div key={ti} className="flex items-center gap-2 pr-3 py-2" style={{ paddingLeft: 20 + tk.depth * 12 }}>
                            <div className="shrink-0 min-w-0" style={{ width: 132 - tk.depth * 12 }}>
                              {tk.breadcrumb && <div className="text-[10px] text-muted-foreground truncate">└ {tk.breadcrumb}</div>}
                              <div className="text-sm font-medium truncate">{tk.name}</div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 truncate"><User className="h-2.5 w-2.5 shrink-0" />{tk.assignee}</div>
                            </div>
                            <div className="flex-1 relative h-5 min-w-0">
                              {tk.kind === 'extend' ? (
                                <>
                                  {/* 先畫紅延長段，再把灰(原定)畫在上層＋給最小寬度 → 0 寬度原定(如 7/1~7/1)也看得見 */}
                                  {tk.newEnd > tk.origEnd && <div className="absolute bg-red-400 h-3 rounded-r-sm" style={{ top: 4, left: `${pct(tk.origEnd)}%`, width: `${w(tk.origEnd, tk.newEnd)}%` }} />}
                                  <div className="absolute bg-slate-300 h-3 rounded-l-sm border-r border-white/70" style={{ top: 4, left: `${pct(tk.origStart)}%`, width: `${Math.max(((tk.origEnd - tk.origStart) / span) * 100, 2)}%` }} />
                                </>
                              ) : (
                                <>
                                  <div className="absolute bg-slate-300 h-3 rounded-sm" style={{ top: 4, left: `${pct(tk.origStart)}%`, width: `${w(tk.origStart, tk.origEnd)}%` }} />
                                  <div className="absolute bg-amber-400 h-3 rounded-sm" style={{ top: 4, left: `${pct(tk.newStart)}%`, width: `${w(tk.newStart, tk.newEnd)}%` }} />
                                </>
                              )}
                            </div>
                            <div className="w-24 shrink-0 text-right text-[11px] tabular-nums leading-tight">
                              <div className="whitespace-nowrap"><span className="text-slate-400">{fmt(tk.origEnd)}</span><span className="mx-0.5 text-muted-foreground">→</span><span className={`font-medium ${tk.kind === 'extend' ? 'text-red-500' : 'text-amber-600'}`}>{fmt(tk.newEnd)}</span></div>
                              {tk.delta !== 0 && <div className={tk.kind === 'extend' ? 'text-red-500' : 'text-amber-600'}>{tk.delta > 0 ? '+' : ''}{tk.delta}天</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
