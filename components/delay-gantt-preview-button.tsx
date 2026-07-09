'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { BarChart3, Loader2, User } from 'lucide-react'
import type { Task, Milestone } from '@/lib/mock-data'

/**
 * 審核者(S)用的「延期影響」樹狀對比視覺（按鈕彈開）。
 * 樹狀：里程碑 → 底下掛它的變更任務（縮排）。共用時間軸：
 *   灰＝原定、紅＝任務工期延長、琥珀＝里程碑順延。
 * 模型：延任務 X → 只有 X 工期拉長(紅)、X 的里程碑與其後里程碑順延(琥珀)；父/子任務不自動連動。
 */
interface DelayInfo {
  projectId: string
  affectedMilestones: { milestoneId: string; milestoneName?: string; originalDate: string; proposedDate: string }[]
  pendingTaskChanges?: { taskId: string; taskTitle: string; startDate?: string; endDate?: string }[]
}

interface TaskNode { name: string; breadcrumb: string; assignee: string; origStart: number; origEnd: number; newEnd: number; delta: number }
interface MsNode { name: string; origDue: number; newDue: number; delta: number; tasks: TaskNode[] }

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
      const taskById = new Map<string, Task>((proj.tasks || []).map((x: Task) => [x.id, x]))

      const breadcrumbOf = (task: Task) => {
        const parts: string[] = []
        let cur: Task | undefined = task.parentId ? taskById.get(task.parentId) : undefined
        const seen = new Set<string>()
        while (cur && !seen.has(cur.id)) { seen.add(cur.id); parts.unshift(cur.title); cur = cur.parentId ? taskById.get(cur.parentId) : undefined }
        return parts.join(' › ')
      }

      // 變更任務依 milestoneId 分組
      const taskChangesByMs = new Map<string, TaskNode[]>()
      for (const tc of (delay.pendingTaskChanges || [])) {
        const cur = taskById.get(tc.taskId)
        if (!cur) continue
        const node: TaskNode = {
          name: tc.taskTitle, breadcrumb: breadcrumbOf(cur), assignee: cur.assignee || '未指派',
          origStart: t(cur.startDate), origEnd: t(cur.endDate),
          newEnd: tc.endDate ? t(tc.endDate) : t(cur.endDate),
          delta: Math.round(((tc.endDate ? t(tc.endDate) : t(cur.endDate)) - t(cur.endDate)) / DAY),
        }
        const arr = taskChangesByMs.get(cur.milestoneId) || []
        arr.push(node); taskChangesByMs.set(cur.milestoneId, arr)
      }

      const out: MsNode[] = delay.affectedMilestones.map(am => {
        const o = t(am.originalDate), n = t(am.proposedDate)
        return { name: am.milestoneName || proj.milestones?.find((m: Milestone) => m.id === am.milestoneId)?.name || '里程碑', origDue: o, newDue: n, delta: Math.round((n - o) / DAY), tasks: taskChangesByMs.get(am.milestoneId) || [] }
      })
      setTree(out)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  // 共用時間軸
  const allTimes = tree.flatMap(m => [m.origDue, m.newDue, ...m.tasks.flatMap(tk => [tk.origStart, tk.origEnd, tk.newEnd])])
  const min = allTimes.length ? Math.min(...allTimes) : 0
  const max = allTimes.length ? Math.max(...allTimes) : 1
  const span = max - min || DAY
  const pct = (ms: number) => ((ms - min) / span) * 100
  const w = (a: number, b: number) => Math.max(((b - a) / span) * 100, 1.5)

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
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-red-400" />任務延長</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-amber-400" />里程碑順延</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />載入中…</div>
            ) : error || tree.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">此延期無可視化的日期變更。</div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-right text-[11px] text-muted-foreground tabular-nums pr-24">{fmt(min)} ~ {fmt(max)}</div>
                <div className="rounded-lg border divide-y">
                  {tree.map((m, mi) => (
                    <div key={mi}>
                      {/* 里程碑列（順延，琥珀） */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                        <div className="w-40 shrink-0 min-w-0 text-sm font-semibold truncate flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />{m.name}
                        </div>
                        <div className="flex-1 relative h-4 min-w-0">
                          <div className="absolute h-2.5 rounded-sm bg-slate-300" style={{ top: 3, left: `${pct(m.origDue)}%`, width: '1.5%' }} />
                          {m.newDue > m.origDue && <div className="absolute border-t-2 border-dashed border-amber-400" style={{ top: 8, left: `${pct(m.origDue)}%`, width: `${Math.max(pct(m.newDue) - pct(m.origDue), 0)}%` }} />}
                          <div className="absolute h-2.5 rounded-sm bg-amber-400" style={{ top: 3, left: `${pct(m.newDue)}%`, width: '1.5%' }} />
                        </div>
                        <div className="w-24 shrink-0 text-right text-[11px] tabular-nums">
                          <span className="text-slate-400">{fmt(m.origDue)}</span><span className="mx-0.5 text-muted-foreground">→</span><span className="text-amber-600 font-medium">{fmt(m.newDue)}</span>
                          {m.delta !== 0 && <span className="text-amber-600"> {m.delta > 0 ? '+' : ''}{m.delta}天</span>}
                        </div>
                      </div>
                      {/* 底下掛的變更任務（縮排，紅色延長） */}
                      {m.tasks.map((tk, ti) => (
                        <div key={ti} className="flex items-center gap-2 pl-7 pr-3 py-2">
                          <div className="w-[132px] shrink-0 min-w-0">
                            {tk.breadcrumb && <div className="text-[10px] text-muted-foreground truncate">└ {tk.breadcrumb}</div>}
                            <div className="text-sm font-medium truncate">{tk.name}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 truncate"><User className="h-2.5 w-2.5 shrink-0" />{tk.assignee}</div>
                          </div>
                          <div className="flex-1 relative h-5 min-w-0">
                            <div className="absolute rounded-l-sm bg-slate-300 h-3" style={{ top: 4, left: `${pct(tk.origStart)}%`, width: `${w(tk.origStart, tk.origEnd)}%` }} />
                            {tk.newEnd > tk.origEnd && <div className="absolute rounded-r-sm bg-red-400 h-3" style={{ top: 4, left: `${pct(tk.origEnd)}%`, width: `${w(tk.origEnd, tk.newEnd)}%` }} />}
                          </div>
                          <div className="w-24 shrink-0 text-right text-[11px] tabular-nums">
                            <span className="text-slate-400">{fmt(tk.origEnd)}</span><span className="mx-0.5 text-muted-foreground">→</span><span className="text-red-500 font-medium">{fmt(tk.newEnd)}</span>
                            {tk.delta !== 0 && <span className="text-red-500"> {tk.delta > 0 ? '+' : ''}{tk.delta}天</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
