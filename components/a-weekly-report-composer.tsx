'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { WeekPicker } from '@/components/ui/week-picker'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { GanttChart } from '@/components/gantt-chart'
import { cn } from '@/lib/utils'
import { uploadFile } from '@/lib/upload-file'
import type { Project, Task, TaskLog, TaskLogAttachment } from '@/lib/mock-data'
import { Loader2, Send, FileText, Info, ChevronDown, CornerDownLeft, CircleCheck, Inbox, Search, Eraser, Paperclip, Save, Check, AlertTriangle, CalendarClock, AlertCircle, BarChart3 } from 'lucide-react'

// 附件小徽章：hover 展開檔案清單（可捲、可點），檔案多也不雜亂
// 傳入 onRemove 時，清單每列會出現移除鈕（用於自己編輯中的附件）
function AttachmentPill({ attachments, onRemove }: { attachments: TaskLogAttachment[]; onRemove?: (i: number) => void }) {
  return (
    <HoverCard openDelay={80} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button type="button" className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:bg-primary/10 rounded px-1.5 py-0.5 shrink-0">
          <Paperclip className="h-3 w-3" />{attachments.length}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-60 p-2">
        <div className="text-[11px] font-medium text-muted-foreground mb-1">附件（{attachments.length}）</div>
        <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
          {attachments.map((att, i) => (
            <div key={i} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted text-xs group">
              <a href={att.url} download={att.name} target="_blank" rel="noopener" className="flex items-center gap-2 flex-1 min-w-0">
                {att.type === 'image'
                  ? <img src={att.url} alt={att.name} className="h-8 w-8 rounded object-cover border shrink-0" />
                  : <span className="h-8 w-8 rounded border bg-muted flex items-center justify-center shrink-0"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                <span className="truncate flex-1">{att.name}</span>
              </a>
              {onRemove && <button type="button" onClick={() => onRemove(i)} className="text-muted-foreground/50 hover:text-destructive text-[11px] shrink-0 px-1">移除</button>}
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function mondayOf(dateStr: string) { const d = new Date(dateStr); const day = d.getDay(); d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); return ymd(d) }
function currentMonday() { return mondayOf(ymd(new Date())) }

type Row = { date: string; content: string; attachments?: TaskLogAttachment[] }
type Node = { id: string; title: string; msId: string; msName: string; depth: number; path: string; isParent: boolean; hasR: boolean; progress: number; assignee: string }

// 有效指派人（排除空字串與「未指派」）
const hasAssignee = (a?: string | null) => !!(a && a.trim() && a.trim() !== '未指派')

export function AWeeklyReportComposer({
  project, initialWeek, actor, actorUserId, open, onOpenChange, onSaved,
}: {
  project: Project; initialWeek?: string; actor: string; actorUserId: string
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [weekOf, setWeekOf] = useState(() => initialWeek || currentMonday())
  const [selectedId, setSelectedId] = useState<string>('')
  const [rows, setRows] = useState<Record<string, Row[]>>({})
  const [nextPlan, setNextPlan] = useState<Record<string, string>>({})
  const [overall, setOverall] = useState('')
  const [overallOpen, setOverallOpen] = useState(false)
  const [markDone, setMarkDone] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [rViewOpen, setRViewOpen] = useState(false)
  const [taskTab, setTaskTab] = useState<'r' | 'write'>('r') // 每任務分頁：看 R 報告 / 我要寫
  const [clearOpen, setClearOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftDone, setDraftDone] = useState(false)   // 暫存成功的短暫提示
  const [uploadingRow, setUploadingRow] = useState<number | null>(null)
  const [uploadRowProgress, setUploadRowProgress] = useState(0)
  const uploadRef = useRef<HTMLInputElement>(null)
  const uploadTargetRow = useRef<number | null>(null)
  const snapshotRef = useRef('') // 載入時的內容快照，用來判斷是否有未儲存變更
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  // 前序守則 / 申請延期 / 標記完成 小流程
  const [prereqOpen, setPrereqOpen] = useState(false)
  const [delayOpen, setDelayOpen] = useState(false)
  const [delayStep, setDelayStep] = useState<'form' | 'confirm'>('form')
  const [delayDate, setDelayDate] = useState('')
  const [delayReason, setDelayReason] = useState('')
  const [delaySupport, setDelaySupport] = useState('')
  const [delaySubmitting, setDelaySubmitting] = useState(false)
  const [delayDone, setDelayDone] = useState(false)
  const [completingPrereq, setCompletingPrereq] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completeDate, setCompleteDate] = useState('')
  const [delayRequestedTasks, setDelayRequestedTasks] = useState<Map<string, string>>(new Map()) // 本次已送出延期申請的任務 → 申請的新截止日
  const [ganttPreviewOpen, setGanttPreviewOpen] = useState(false)

  const { weekStart, weekEnd } = useMemo(() => {
    const s = new Date(weekOf); const e = new Date(weekOf); e.setDate(e.getDate() + 6)
    return { weekStart: ymd(s), weekEnd: ymd(e) }
  }, [weekOf])

  const byId = useMemo(() => new Map(project.tasks.map(t => [t.id, t])), [project.tasks])
  // A 依「填報週(weekOf)」看 R 的報告：R 填 W12 就在 W12 看到；舊資料(無 weekOf) fallback 用工作日(logDate)
  const rLogsOf = (id: string) => project.taskLogs.filter(l => l.taskId === id && l.author !== actor && (l.weekOf ? l.weekOf === weekOf : (l.logDate >= weekStart && l.logDate <= weekEnd))).slice().sort((a, b) => a.logDate.localeCompare(b.logDate))
  // R 的全部報告(不綁 A 的填報週)：讓 A 寫某週報告時，上方照樣看得到 R 的全部歷史，不用切週別。
  const rAllLogsOf = (id: string) => project.taskLogs.filter(l => l.taskId === id && l.author !== actor).slice().sort((a, b) => a.logDate.localeCompare(b.logDate))

  // 樹狀清單（給下拉）
  const nodes = useMemo<Node[]>(() => {
    const childrenOf = (id: string) => project.tasks.filter(t => t.parentId === id)
    const ctxOf = (t: Task) => { const a: string[] = []; let c = t.parentId ? byId.get(t.parentId) : undefined; while (c) { a.unshift(c.title); c = c.parentId ? byId.get(c.parentId) : undefined } return a.join(' › ') }
    const out: Node[] = []
    for (const ms of project.milestones) {
      const walk = (t: Task, depth: number) => {
        const kids = childrenOf(t.id)
        out.push({ id: t.id, title: t.title, msId: ms.id, msName: ms.name, depth, path: [ms.name, ctxOf(t)].filter(Boolean).join(' › '), isParent: kids.length > 0, hasR: rLogsOf(t.id).length > 0, progress: t.progress, assignee: t.assignee || '' })
        kids.forEach(k => walk(k, depth + 1))
      }
      project.tasks.filter(t => t.milestoneId === ms.id && !t.parentId).forEach(t => walk(t, 0))
    }
    return out
  }, [project, weekStart, weekEnd, actor]) // eslint-disable-line react-hooks/exhaustive-deps

  // 下拉：依里程碑分組（里程碑當標頭、不可選；底下列出任務）
  const groupedForPicker = useMemo(() => {
    const q = search.trim().toLowerCase()
    return project.milestones.map(ms => {
      const all = nodes.filter(n => n.msId === ms.id)
      const tasks = q ? all.filter(n => (n.title + ' ' + n.path).toLowerCase().includes(q)) : all
      return { msId: ms.id, msName: ms.name, tasks, total: all.length }
    }).filter(g => (q ? g.tasks.length > 0 : true))
  }, [nodes, project.milestones, search])

  const sel = useMemo(() => nodes.find(n => n.id === selectedId), [nodes, selectedId])
  const selTask = selectedId ? byId.get(selectedId) : undefined
  const selRLogs = selectedId ? rLogsOf(selectedId) : []
  const selRAll = selectedId ? rAllLogsOf(selectedId) : [] // R 全部歷史（不綁週別），供 A 唯讀參考
  const selKidLogs = useMemo(() => selectedId ? project.tasks.filter(t => t.parentId === selectedId).flatMap(k => rLogsOf(k.id).map(l => ({ title: k.title, log: l }))) : [], [selectedId, project.tasks, weekStart, weekEnd, actor]) // eslint-disable-line react-hooks/exhaustive-deps

  // 頂層祖先（往上走 parentId 到頂）
  const topAncestorOf = (t: Task): Task => {
    let cur = t
    const seen = new Set<string>()
    while (cur.parentId && byId.get(cur.parentId) && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.parentId)! }
    return cur
  }
  // 頂層任務的全域順序（里程碑順序 → 任務陣列順序），供「前序＝上游」判定
  const topOrder = useMemo(() => {
    const msIdx = new Map(project.milestones.map((m, i) => [m.id, i]))
    const arrIdx = new Map(project.tasks.map((t, i) => [t.id, i]))
    const map = new Map<string, number>()
    project.tasks.filter(t => !t.parentId).slice()
      .sort((a, b) => {
        const ma = msIdx.get(a.milestoneId) ?? 0, mb = msIdx.get(b.milestoneId) ?? 0
        return ma !== mb ? ma - mb : (arrIdx.get(a.id) ?? 0) - (arrIdx.get(b.id) ?? 0)
      })
      .forEach((t, i) => map.set(t.id, i))
    return map
  }, [project.milestones, project.tasks])

  // 前序 = 「排在選取任務的頂層祖先之前」的所有未完成任務（上游，跨里程碑）。
  //   不含選取任務自己的群組(祖先鏈/自己/子孫)、也不含下游；選子孫時一律以其頂層祖先判定
  //   → 點 bbb 底下任何一層(6 層)都會觸發，一鍵只標「上游」而非整個里程碑。
  const incompletePrereqsOf = (taskId: string): Task[] => {
    const t = byId.get(taskId)
    if (!t) return []
    const xOrd = topOrder.get(topAncestorOf(t).id) ?? 0
    return project.tasks.filter(t2 => {
      if (t2.status === 'done') return false
      const ord = topOrder.get(topAncestorOf(t2).id) ?? 0
      return ord < xOrd
    })
  }
  const selPrereqs = useMemo(() => (selTask ? incompletePrereqsOf(selTask.id) : []), [selTask, byId, topOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  // 上游未完成任務所在的里程碑（顯示用）
  const prereqMilestones = useMemo(() => {
    const ids = new Set(selPrereqs.map(p => p.milestoneId))
    return project.milestones.filter(m => ids.has(m.id))
  }, [selPrereqs, project.milestones])
  // 一鍵標 100% 的對象＝「上游未完成任務」本身（不再是整個里程碑，不含自己/子孫）
  const prereqTodoTasks = selPrereqs
  // 可跳去填寫的上游葉任務：取「最接近的」上游葉（topOrder 最大），真正該先做的那一個
  const prereqJumpTarget = useMemo(() => {
    const leaves = selPrereqs.filter(t => !project.tasks.some(c => c.parentId === t.id))
    if (leaves.length === 0) return undefined
    return leaves.reduce((best, t) =>
      (topOrder.get(topAncestorOf(t).id) ?? 0) > (topOrder.get(topAncestorOf(best).id) ?? 0) ? t : best
    )
  }, [selPrereqs, project.tasks, topOrder]) // eslint-disable-line react-hooks/exhaustive-deps
  // 樹狀排序（含 depth）：供 hover 清單以層級呈現（只列上游未完成）
  const prereqTreeItems = useMemo(() => {
    const ids = new Set(selPrereqs.map(p => p.id))
    const msById = new Map(project.milestones.map(m => [m.id, m.name]))
    const childrenOf = (pid: string) => project.tasks.filter(t => t.parentId === pid && ids.has(t.id))
    const out: { id: string; title: string; depth: number; msName: string }[] = []
    const walk = (t: Task, depth: number) => {
      out.push({ id: t.id, title: t.title, depth, msName: msById.get(t.milestoneId) || '' })
      childrenOf(t.id).forEach(k => walk(k, depth + 1))
    }
    selPrereqs.filter(t => !t.parentId || !ids.has(t.parentId!))
      .sort((a, b) => (topOrder.get(topAncestorOf(a).id) ?? 0) - (topOrder.get(topAncestorOf(b).id) ?? 0))
      .forEach(t => walk(t, 0))
    return out
  }, [selPrereqs, project.tasks, project.milestones, topOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  // 選任務（預設切到「看 R 報告」分頁；前序/延期改用任務內小標籤提示，不再自動跳窗）
  const chooseTask = (id: string) => {
    setSelectedId(id); setPickerOpen(false); setSearch(''); setTaskTab('r')
  }

  // 一鍵把「上游」所有未完成任務標記完成（不含自己/子孫；先暫存草稿避免遺失，再整頁刷新）
  const completePrereqMilestones = async () => {
    if (prereqTodoTasks.length === 0) return
    setCompletingPrereq(true)
    try {
      await fetch(`/api/projects/${project.id}/weekly-report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload(false)) }).catch(() => {})
      const today = ymd(new Date())
      for (const t of prereqTodoTasks) {
        await fetch(`/api/projects/${project.id}/tasks/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done', progress: 100, completedBy: actor, completedAt: today, completedWeekOf: weekOf }) })
      }
      setPrereqOpen(false)
      onSaved()
    } catch { alert('批次標記完成失敗，請稍後再試') } finally { setCompletingPrereq(false) }
  }

  // 申請延期：以新截止日計算里程碑影響（與任務詳情同邏輯）
  const delayImpact = useMemo(() => {
    if (!selTask || !delayDate) return null
    const ms = project.milestones.find(m => m.id === selTask.milestoneId)
    if (!ms) return null
    const extraDays = Math.round((new Date(delayDate).getTime() - new Date(selTask.endDate).getTime()) / 86400000)
    if (extraDays <= 0) return null
    const msTasks = project.tasks.filter(t => t.milestoneId === ms.id && !t.parentId)
    const currentTotal = msTasks.reduce((s, t) => s + Math.max(t.durationDays || 1, 1), 0)
    const newTotal = currentTotal + extraDays
    const msDue = new Date(ms.dueDate)
    const effStart = new Date(msDue); effStart.setDate(effStart.getDate() - currentTotal + 1)
    const newMsEnd = new Date(effStart); newMsEnd.setDate(newMsEnd.getDate() + newTotal - 1)
    const milestoneDelta = Math.max(0, Math.round((newMsEnd.getTime() - msDue.getTime()) / 86400000))
    const proposedMilestoneDate = milestoneDelta > 0 ? newMsEnd.toISOString().split('T')[0] : ms.dueDate.split('T')[0]
    return { extraDays, milestoneDelta, proposedMilestoneDate, msName: ms.name, msDue: ms.dueDate }
  }, [selTask, delayDate, project])

  // 依「里程碑順序」的後續里程碑（延期只讓其後里程碑順延，不看相依、不動任務）
  const subsequentMilestones = useMemo(() => {
    if (!selTask) return [] as typeof project.milestones
    const idx = project.milestones.findIndex(m => m.id === selTask.milestoneId)
    return idx >= 0 ? project.milestones.slice(idx + 1) : []
  }, [selTask, project.milestones])

  // 延期前後差異（甘特視覺化）：原定區間(灰) vs 延後區間(橘)
  //  - 延期里程碑：起始不變、結束延後（條變長）
  //  - 下游里程碑：整條往後平移
  const delayPreviewRows = useMemo(() => {
    if (!selTask || !delayImpact) return [] as { name: string; oe: string; ne: string; delta: number; osPct: number; oePct: number; nsPct: number; nePct: number }[]
    const dstr = (d: string | Date) => (typeof d === 'string' ? d : ymd(new Date(d)))
    const msStartOf = (msId: string) => {
      const ts = project.tasks.filter(t => t.milestoneId === msId)
      if (!ts.length) return null
      return ts.reduce((m, t) => (t.startDate < m ? t.startDate : m), ts[0].startDate)
    }
    const shiftDays = (d: string, n: number) => ymd(new Date(new Date(d).getTime() + n * 86400000))
    const raw: { name: string; os: string; oe: string; ns: string; ne: string; delta: number }[] = []
    const ms = project.milestones.find(m => m.id === selTask.milestoneId)
    if (ms) {
      const oe = dstr(ms.dueDate); const os = msStartOf(ms.id) || oe
      raw.push({ name: ms.name, os, oe, ns: os, ne: delayImpact.proposedMilestoneDate, delta: delayImpact.milestoneDelta })
    }
    for (const dm of subsequentMilestones) {
      const oe = dstr(dm.dueDate); const os = msStartOf(dm.id) || oe
      raw.push({ name: dm.name, os, oe, ns: shiftDays(os, delayImpact.extraDays), ne: shiftDays(oe, delayImpact.extraDays), delta: delayImpact.extraDays })
    }
    const times = raw.flatMap(r => [r.os, r.oe, r.ns, r.ne].map(d => new Date(d).getTime()))
    const min = Math.min(...times), max = Math.max(...times), span = max - min || 1
    const p = (d: string) => ((new Date(d).getTime() - min) / span) * 100
    return raw.map(r => ({ name: r.name, oe: r.oe, ne: r.ne, delta: r.delta, osPct: p(r.os), oePct: p(r.oe), nsPct: p(r.ns), nePct: p(r.ne) }))
  }, [selTask, delayImpact, subsequentMilestones, project.milestones, project.tasks])

  const openDelay = (preferDate?: string) => {
    if (!selTask) return
    // 預設新截止日：指定日 或 填報最晚日 或 今天
    const base = preferDate || selOverdue?.latest || ymd(new Date())
    setDelayDate(base); setDelayReason(''); setDelaySupport(''); setDelayDone(false); setDelayStep('form'); setDelayOpen(true)
  }

  const submitDelay = async () => {
    if (!selTask || !actorUserId) return
    const ms = project.milestones.find(m => m.id === selTask.milestoneId)
    if (!ms || !delayImpact) { alert('新截止日必須晚於目前截止日'); return }
    if (!delayReason.trim()) { alert('請填寫延期原因'); return }
    setDelaySubmitting(true)
    try {
      // 延期連動模型（見 memory/delay-cascade-model）：
      //   🔴 延期群組(延長)= X + X 的父層鏈 + X 的里程碑（只改 endDate）。
      //   🟠 下游(順延)= 同里程碑內排在 X 頂層之後的任務 + 其後里程碑全部任務（改 startDate+endDate）。
      //   視覺用「有沒有 startDate」判斷：無=延長(紅)、有=順延(琥珀)。
      const shiftYmd = (d: string, n: number) => ymd(new Date(new Date(d).getTime() + n * 86400000))
      const dstr = (d: string | Date) => (typeof d === 'string' ? d : ymd(new Date(d)))
      const N = delayImpact.extraDays
      // X 的父層鏈（含 X，往上到頂層）
      const chain: Task[] = []
      { let cur: Task | undefined = selTask; const seen = new Set<string>()
        while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.push(cur); cur = cur.parentId ? byId.get(cur.parentId) : undefined } }
      const groupIds = new Set(chain.map(t => t.id))
      const topAncestorOf = (t: Task): Task => {
        let cur = t; const seen = new Set<string>()
        while (cur.parentId && byId.get(cur.parentId) && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.parentId)! }
        return cur
      }
      // 順序＝任務在（已依 sortOrder 排序的）project.tasks 陣列中的索引
      const taskIndex = new Map(project.tasks.map((t, i) => [t.id, i]))
      const orderOf = (t: Task) => taskIndex.get(topAncestorOf(t).id) ?? 0
      const sX = orderOf(selTask)
      const miX = project.milestones.findIndex(m => m.id === selTask.milestoneId)
      // 下游順延任務：後續里程碑全部 + 同里程碑排在 X 頂層之後（不含 X 群組、不含 X 子孫）
      const shiftTasks = N > 0 ? project.tasks.filter(t => {
        if (groupIds.has(t.id)) return false
        const mt = project.milestones.findIndex(m => m.id === t.milestoneId)
        if (mt > miX) return true
        if (t.milestoneId === selTask.milestoneId) return orderOf(t) > sX
        return false
      }) : []
      const pendingTaskChanges = [
        // 延期群組觸發本體：X 到新截止日（工期由核准端 step 3 延長）
        { taskId: selTask.id, taskTitle: selTask.title, endDate: delayDate },
        // 祖先：endDate += N「且」durationDays += N —— 否則核准端 step-4 會用舊工期把 aaa/a1 的日期改回去（紅段消失）
        ...chain.slice(1).map(a => ({ taskId: a.id, taskTitle: a.title, endDate: shiftYmd(dstr(a.endDate), N), durationDays: (a.durationDays || 1) + N })),
        // 下游順延：整條 start/end += N（有 startDate → 琥珀順延）
        ...shiftTasks.map(t => ({ taskId: t.id, taskTitle: t.title, startDate: shiftYmd(dstr(t.startDate), N), endDate: shiftYmd(dstr(t.endDate), N) })),
      ]
      const affectedMilestones = [
        { milestoneId: ms.id, originalDate: ms.dueDate, proposedDate: delayImpact.proposedMilestoneDate },
        ...(N > 0
          ? subsequentMilestones.map(sm => {
              const od = dstr(sm.dueDate)
              return { milestoneId: sm.id, originalDate: od, proposedDate: shiftYmd(od, N) }
            })
          : []),
      ]
      const res = await fetch('/api/delay-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id, requesterId: actorUserId, reason: delayReason.trim(),
          canCatchUp: false, supportNeeded: delaySupport.trim(), taskId: selTask.id,
          affectedMilestones,
          ...(pendingTaskChanges.length ? { pendingTaskChanges } : {}),
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || '送出失敗') }
      setDelayRequestedTasks(p => new Map(p).set(selTask.id, delayDate))
      setDelayDone(true)
      // 先保存目前報告草稿（避免重載遺失正在寫的內容），再刷新外層：
      //   延遲紀錄 / 待審核橫幅 / 甘特會即時反映，不用手動重新整理
      await saveDraft()
      setTimeout(() => { setDelayOpen(false); setDelayDone(false); onSaved() }, 1200)
    } catch (e) { alert(e instanceof Error ? e.message : '送出延期申請失敗') } finally { setDelaySubmitting(false) }
  }

  // 「待送的標記完成」草稿存 localStorage（每專案+週+作者一份）。暫存＝存草稿、不完成任務；
  //   送出週報才真的套用完成。→ A 每次打開都能改，標記完成不會按下就送出。
  const mdKey = `a-md:${project.id}:${weekOf}:${actorUserId}`
  const readDraftMarks = (): Record<string, string> => {
    try { const s = localStorage.getItem(mdKey); return s ? JSON.parse(s) : {} } catch { return {} }
  }
  const writeDraftMarks = (m: Record<string, string>) => {
    try { if (Object.keys(m).length) localStorage.setItem(mdKey, JSON.stringify(m)); else localStorage.removeItem(mdKey) } catch { /* quota / no-op */ }
  }

  useEffect(() => {
    if (!open) return
    setLoading(true); setSelectedId('')
    // 還原「待送標記」草稿：只留「尚未真正完成」的任務（已完成的以 completedAt 顯示，不當待送）
    const restore = () => {
      const draft = readDraftMarks()
      const md: Record<string, string> = {}
      for (const [id, d] of Object.entries(draft)) if (!byId.get(id)?.completedAt) md[id] = d
      return md
    }
    fetch(`/api/projects/${project.id}/weekly-report?weekOf=${weekOf}&authorId=${actorUserId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { aLogs: { taskId: string; logDate: string; content: string; attachments: TaskLogAttachment[]; nextPlans: { content: string }[] }[]; notes: { taskId: string; content: string }[] }) => {
        const nr: Record<string, Row[]> = {}; const np: Record<string, string> = {}
        for (const l of data.aLogs) { (nr[l.taskId] = nr[l.taskId] || []).push({ date: l.logDate, content: l.content, attachments: l.attachments?.length ? l.attachments : undefined }); if (l.nextPlans?.length) np[l.taskId] = l.nextPlans.map(p => p.content).join('\n') }
        const ov = data.notes.find(n => n.taskId === '')?.content || ''
        const md = restore()
        setRows(nr); setNextPlan(np); setOverall(ov); setMarkDone(md)
        snapshotRef.current = JSON.stringify({ rows: nr, nextPlan: np, overall: ov, markDone: md })
      })
      .catch(() => { const md = restore(); setRows({}); setNextPlan({}); setOverall(''); setMarkDone(md); snapshotRef.current = JSON.stringify({ rows: {}, nextPlan: {}, overall: '', markDone: md }) })
      .finally(() => setLoading(false))
  }, [open, project.id, weekOf, actorUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  const rowsFor = (id: string) => rows[id] || [{ date: '', content: '' }]
  const setRowsFor = (id: string, next: Row[]) => setRows(p => ({ ...p, [id]: next }))
  const importR = () => { if (selectedId) setRowsFor(selectedId, selRLogs.map(l => ({ date: l.logDate, content: l.content, attachments: l.attachments?.length ? [...l.attachments] : undefined }))); setRViewOpen(false) }
  const importKids = () => { if (selectedId) setRowsFor(selectedId, selKidLogs.map(c => ({ date: c.log.logDate, content: `【${c.title}】${c.log.content}`, attachments: c.log.attachments?.length ? [...c.log.attachments] : undefined }))) }
  const clearSel = () => { if (selectedId) { setRows(p => { const n = { ...p }; delete n[selectedId]; return n }); setNextPlan(p => { const n = { ...p }; delete n[selectedId]; return n }); setMarkDone(p => { const n = { ...p }; delete n[selectedId]; return n }) } setClearOpen(false) }

  const reportCount = useMemo(() => Object.values(rows).filter(rs => rs.some(r => r.content.trim() && r.date)).length + (overall.trim() ? 1 : 0), [rows, overall])
  const doneCount = Object.keys(markDone).length
  const selDirty = selectedId ? (rowsFor(selectedId).some(r => r.content.trim() || r.date) || !!nextPlan[selectedId]) : false
  const selHasLog = selectedId ? rowsFor(selectedId).some(r => r.content.trim() && r.date) : false

  // 延期偵測：填報/標記完成日期只要超過規劃截止日，就必須走申請延期
  const OVERSHOOT_DAYS = 0
  const selOverdue = useMemo(() => {
    if (!selTask || !selectedId || !selTask.endDate) return null
    const cand: string[] = []
    const md = markDone[selectedId]; if (md) cand.push(md)
    // 只算「有內容」的工作紀錄列，與送出擋控一致（空列不算報告）
    for (const r of (rows[selectedId] || [])) if (r.date && r.content.trim()) cand.push(r.date)
    if (!cand.length) return null
    const latest = [...cand].sort().slice(-1)[0]
    const diffDays = Math.round((new Date(latest).getTime() - new Date(selTask.endDate).getTime()) / 86400000)
    return diffDays > OVERSHOOT_DAYS ? { latest, end: selTask.endDate, diffDays } : null
  }, [selTask, selectedId, sel, markDone, rows])

  // 即時甘特預覽：重用原本 GanttChart 模板（showBaseline 會畫「預計 vs 實際」）
  //  - 暫定填寫的 rows → 合成 log，讓「實際條起點 = 第一份報告日」
  //  - 標記完成 → completedAt（實際條終點）
  //  - 申請延期 → 拉長任務 endDate、里程碑 dueDate（畫在預計條）
  const previewGantt = useMemo(() => {
    const tasks = project.tasks.map(t => {
      const md = markDone[t.id]
      const delayNew = delayRequestedTasks.get(t.id)
      const reportDates = (rows[t.id] || []).filter(r => r.content.trim() && r.date).map(r => r.date)
      // 報告日期→時間推算進度（與後端 syncTaskProgressFromLogs 一致：濾掉起始日前/截止後的紀錄，不硬給 1%）
      let progress = t.progress
      if (reportDates.length) {
        const plannedStart = new Date(t.originalStartDate && t.originalStartDate < t.startDate ? t.originalStartDate : t.startDate).getTime()
        const end = new Date(delayNew || t.endDate).getTime()
        const upToEnd = reportDates.map(d => new Date(d).getTime()).filter(ms => ms <= end)
        if (upToEnd.length) {
          const earliest = Math.min(...upToEnd)
          const latest = Math.max(...upToEnd)
          const effStart = Math.min(earliest, plannedStart) // 提前開工→基準往前拉
          const span = end - effStart
          progress = span > 0 ? Math.min(99, Math.max(0, Math.round(((latest - effStart) / span) * 100))) : 99
        }
      }
      return {
        ...t,
        ...(delayNew ? { endDate: delayNew, originalEndDate: t.originalEndDate || t.endDate } : {}),
        ...(md ? { status: 'done' as const, progress: 100, completedAt: md } : { progress }),
      }
    })
    const milestones = project.milestones.map(m => {
      const delayedEnds = project.tasks.filter(t => t.milestoneId === m.id && delayRequestedTasks.has(t.id)).map(t => delayRequestedTasks.get(t.id) as string)
      if (delayedEnds.length) {
        const maxEnd = [...delayedEnds].sort().slice(-1)[0]
        if (new Date(maxEnd) > new Date(m.dueDate)) return { ...m, dueDate: maxEnd }
      }
      return m
    })
    const synthetic: TaskLog[] = []
    for (const [taskId, rs] of Object.entries(rows)) {
      for (const r of rs) {
        if (r.content.trim() && r.date) synthetic.push({ id: `preview-${taskId}-${r.date}`, taskId, projectId: project.id, author: actor, logDate: r.date, content: r.content, createdAt: r.date })
      }
    }
    return { tasks, milestones, taskLogs: [...project.taskLogs, ...synthetic], start: project.startDate, end: project.endDate }
  }, [project, rows, markDone, delayRequestedTasks, actor])

  // 共用：把目前填寫內容打包成 API payload
  const buildPayload = (submit: boolean) => {
    const taskEntries = Object.entries(rows).map(([taskId, rs]) => ({ taskId, entries: rs.filter(r => r.content.trim() && r.date).map(r => ({ logDate: r.date, content: r.content.trim(), attachments: r.attachments?.length ? r.attachments : undefined })), nextPlans: nextPlan[taskId]?.trim() ? [{ content: nextPlan[taskId].trim() }] : [] })).filter(te => te.entries.length > 0)
    const noteList = overall.trim() ? [{ taskId: '', content: overall.trim() }] : []
    return { weekOf, actor, authorId: actorUserId, taskEntries, notes: noteList, submit }
  }

  // 暫存草稿：只存不發布(submit:false)，視窗維持開啟，可稍後再回來續填
  const saveDraft = async (): Promise<boolean> => {
    setSavingDraft(true); setDraftDone(false)
    try {
      const res = await fetch(`/api/projects/${project.id}/weekly-report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload(false)) })
      if (!res.ok) throw new Error()
      // 「待送的標記完成」只存草稿(localStorage)，**不完成任務**——完成只在「送出週報」時發生。
      //   → 重開撰寫台能還原、可繼續改；標記完成不會按下就送出。
      writeDraftMarks(markDone)
      snapshotRef.current = JSON.stringify({ rows, nextPlan, overall, markDone }) // 暫存成功→更新快照（含待送標記）
      setDraftDone(true); setTimeout(() => setDraftDone(false), 2500)
      return true
    } catch { alert('暫存失敗，請稍後再試'); return false } finally { setSavingDraft(false) }
  }

  // A 自己上傳附件到指定列
  const pickFilesForRow = (ri: number) => { uploadTargetRow.current = ri; uploadRef.current?.click() }
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arr = e.target.files ? Array.from(e.target.files) : [] // 先快照，避免下一行 reset 清空 FileList
    const ri = uploadTargetRow.current
    e.target.value = ''
    if (!arr.length || ri === null || !selectedId) return
    setUploadingRow(ri)
    setUploadRowProgress(0)
    try {
      const uploaded: TaskLogAttachment[] = []
      let completed = 0
      for (const f of arr) {
        const d = await uploadFile(f, p => {
          const cur = p < 0 ? 0 : p
          setUploadRowProgress(Math.round(((completed + cur / 100) / arr.length) * 100))
        })
        uploaded.push({ name: d.name || f.name, url: d.url, type: (d.type === 'image' || f.type.startsWith('image/')) ? 'image' : 'file' })
        completed++
      }
      if (uploaded.length) setRows(p => { const cur = p[selectedId] || [{ date: '', content: '' }]; return { ...p, [selectedId]: cur.map((row, i) => i === ri ? { ...row, attachments: [...(row.attachments || []), ...uploaded] } : row) } })
    } catch (err) { alert(err instanceof Error ? err.message : '附件上傳失敗') } finally { setUploadingRow(null); setUploadRowProgress(0); uploadTargetRow.current = null }
  }
  const removeAttachment = (ri: number, ai: number) => { if (!selectedId) return; setRows(p => { const cur = p[selectedId] || []; return { ...p, [selectedId]: cur.map((row, i) => i === ri ? { ...row, attachments: (row.attachments || []).filter((_, k) => k !== ai) } : row) } }) }

  const doSubmit = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/weekly-report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload(true)) })
      if (!res.ok) throw new Error()
      // 送出週報才真的套用完成（標記完成在此生效）；completedWeekOf=本報告填報週 → 更新紀錄依此分組
      for (const [taskId, date] of Object.entries(markDone)) {
        await fetch(`/api/projects/${project.id}/tasks/${taskId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done', progress: 100, completedBy: actor, completedAt: date, completedWeekOf: weekOf }) })
      }
      writeDraftMarks({}) // 已送出 → 清掉待送標記草稿
      setConfirmOpen(false); onSaved(); onOpenChange(false)
    } catch { alert('送出失敗，請稍後再試') } finally { setSaving(false) }
  }

  const rs = selectedId ? rowsFor(selectedId) : []
  const willDone = selectedId ? markDone[selectedId] : undefined

  // 送出前預覽：被標記完成的任務會如何影響進度（子層 100%，父層/里程碑隨之上升）
  const donePreview = useMemo(() => Object.entries(markDone).map(([id, date]) => {
    const t = byId.get(id); const n = nodes.find(x => x.id === id)
    return t ? { id, title: t.title, msName: n?.msName || '', from: t.progress, date } : null
  }).filter((x): x is { id: string; title: string; msName: string; from: number; date: string } => !!x), [markDone, byId, nodes])

  // 標記完成的日期是否已超過截止日（超過就必須先申請延期）
  const completeOverdue = !!(selTask && completeDate && new Date(completeDate).getTime() > new Date(selTask.endDate).getTime())

  // 已送出延期申請的任務（本次 session ∪ DB 既有 pending）→ 提醒 badge / 下拉標示共用，
  // 避免「已送過審核卻還叫我再申請一次」。
  const pendingDelayTaskIds = useMemo(() => {
    const s = new Set<string>(delayRequestedTasks.keys())
    for (const dr of (project.delayRequests || [])) {
      if (dr.status === 'pending' && dr.taskId) s.add(dr.taskId)
    }
    return s
  }, [delayRequestedTasks, project.delayRequests])

  // 送出前檢查：填報日超過截止日、又還沒申請延期的任務（必須先處理才能送出）
  const overdueUnresolved = useMemo(() => {
    const out: { id: string; title: string; latest: string; end: string }[] = []
    for (const [taskId, rs] of Object.entries(rows)) {
      const task = byId.get(taskId)
      if (!task) continue
      const filled = rs.filter(r => r.content.trim() && r.date)
      if (!filled.length) continue
      const latest = filled.map(r => r.date).sort().slice(-1)[0]
      if (new Date(latest).getTime() <= new Date(task.endDate).getTime()) continue
      const resolved = delayRequestedTasks.has(taskId) ||
        project.delayRequests?.some(dr => dr.status === 'pending' && dr.affectedMilestones?.some(am => am.milestoneId === task.milestoneId))
      if (!resolved) out.push({ id: taskId, title: task.title, latest, end: task.endDate })
    }
    return out
  }, [rows, byId, delayRequestedTasks, project.delayRequests])

  // 半填的列（只填日期或只填內容）——不允許送出，避免用空內容繞過逾期擋控
  const incompleteRows = useMemo(() => {
    const out: { id: string; title: string }[] = []
    for (const [taskId, rs] of Object.entries(rows)) {
      const half = rs.some(r => (!!r.date) !== (!!r.content.trim()))
      if (half) out.push({ id: taskId, title: byId.get(taskId)?.title || '任務' })
    }
    return out
  }, [rows, byId])

  // 同日重複：同一任務開兩列同一天 → 後端視為同一筆會互相覆蓋（與 R 端 rDuplicateDates 卡控一致）
  const duplicateDateTasks = useMemo(() => {
    const out: { id: string; title: string }[] = []
    for (const [taskId, rs] of Object.entries(rows)) {
      const dates = rs.filter(r => r.date && r.content.trim()).map(r => r.date)
      if (new Set(dates).size !== dates.length) out.push({ id: taskId, title: byId.get(taskId)?.title || '任務' })
    }
    return out
  }, [rows, byId])

  // 按「送出」：半填時按鈕已禁用（見 footer）。逾期不再硬擋——改在確認框軟提醒，
  // A 仍可送出（逾期紀錄不計進度），申請延期變成建議而非必要。
  const onClickSubmit = () => {
    if (incompleteRows.length > 0 || duplicateDateTasks.length > 0) return
    setConfirmOpen(true)
  }

  // 是否有未儲存變更（報告內容變動，或有待送出的標記完成）
  // 純 const（不可用 useMemo）：snapshotRef 是 ref、不在 deps，暫存後更新 snapshot 但 rows/markDone
  //   沒變會讓 useMemo 回傳舊值 → 暫存後仍誤判「未儲存」。每次 render 重算才會讀到最新 snapshot。
  const dirty = JSON.stringify({ rows, nextPlan, overall, markDone }) !== snapshotRef.current
  // 關閉時：有未儲存內容 → 先提醒
  const handleDialogOpenChange = (v: boolean) => {
    if (!v && !loading && dirty) { setCloseConfirmOpen(true); return }
    onOpenChange(v)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />撰寫本週報告 — {project.name}</DialogTitle>
            <DialogDescription className="text-sm">挑選任務填報；每個任務會標示進度計算方式（有指派人以 R 報告為準、無指派人以你的報告為準）。</DialogDescription>
            <div className="pt-2 flex items-end gap-2">
              <div className="flex-1 min-w-0"><WeekPicker value={weekOf} onChange={setWeekOf} /></div>
              <Button variant="outline" className="gap-1.5 shrink-0 h-[38px]" onClick={() => setGanttPreviewOpen(true)}><BarChart3 className="h-4 w-4 text-blue-500" />預覽甘特</Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <>
                {/* 專案彙整說明（收合，不佔版面）*/}
                <div className="rounded-lg border">
                  <button onClick={() => setOverallOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">本週專案彙整說明</span>
                    {overall.trim() ? <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-green-50 text-green-700 border-green-300">已填</Badge> : <span className="text-[11px] text-muted-foreground">（選填）</span>}
                    <span className="flex-1" />
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', overallOpen && 'rotate-180')} />
                  </button>
                  {overallOpen && <div className="px-3 pb-3"><Textarea value={overall} onChange={e => setOverall(e.target.value)} rows={2} placeholder="這週專案整體進展、重點、風險…（顯示在更新紀錄最前面）" className="text-sm" /></div>}
                </div>
                {/* 淡分隔線：把「彙整說明」與下方選任務區隔開 */}
                <div className="border-b border-border/40" />

                {/* 選任務（可搜尋樹狀下拉）*/}
                <div className="space-y-1.5">
                  <div className="text-sm font-medium">選擇要填的項目</div>
                  <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                      <button className="w-full flex items-center gap-2 border rounded-lg px-3 py-2 text-sm hover:bg-muted/40">
                        {sel ? (
                          <span className="flex-1 min-w-0 text-left">
                            <span className="text-[11px] text-muted-foreground block truncate">{sel.path.replace('› ' + sel.title, '')}</span>
                            <span className="font-medium">{sel.title}</span>
                          </span>
                        ) : <span className="flex-1 text-left text-muted-foreground">選擇里程碑 / 任務 / 子任務…</span>}
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" collisionPadding={12} className="w-[--radix-popover-trigger-width] p-0 overflow-hidden flex flex-col" style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}>
                      <div className="p-2 border-b flex items-center gap-1.5 shrink-0"><Search className="h-3.5 w-3.5 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋任務…" className="h-7 text-sm border-0 focus-visible:ring-0 px-0" /></div>
                      <div className="flex-1 overflow-y-auto py-1 min-h-0" onWheel={e => e.stopPropagation()}>
                        {groupedForPicker.length === 0 ? <p className="text-xs text-muted-foreground text-center py-3">找不到符合的任務</p> : groupedForPicker.map(g => (
                          <div key={g.msId}>
                            <div className="flex items-center gap-1.5 px-2 py-1 mt-0.5 bg-muted/40 text-[11px] font-semibold text-muted-foreground sticky top-0">
                              <span className="flex-1 truncate">{g.msName}</span>
                              <span className="text-[11px] font-normal text-muted-foreground/70">{g.total > 0 ? `${g.total} 個任務` : '無任務'}</span>
                            </div>
                            {g.tasks.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground/50 px-3 py-1.5">此里程碑底下沒有任務</p>
                            ) : g.tasks.map(n => (
                              <button key={n.id} onClick={() => chooseTask(n.id)}
                                className={cn('w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/60 text-left', n.id === selectedId && 'bg-primary/10')}
                                style={{ paddingLeft: 12 + n.depth * 16 }}>
                                <span className="flex-1 min-w-0 truncate">{n.depth > 0 && <span className="text-muted-foreground/40 mr-1">└</span>}{n.title}{n.isParent && <span className="text-[11px] text-violet-500 ml-1">(父)</span>}{(() => { const bt = byId.get(n.id); return bt ? <span className="text-[11px] text-muted-foreground/70 tabular-nums ml-1.5">{new Date(bt.startDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}~{new Date(bt.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span> : null })()}</span>
                                {pendingDelayTaskIds.has(n.id) && <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-300 shrink-0">延期待審核</Badge>}
                                {byId.get(n.id)?.completedAt
                                  ? <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-300 shrink-0">已完成</Badge>
                                  : (rows[n.id] || []).some(r => r.content.trim() && r.date) ? <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-300 shrink-0">我已填</Badge> : null}
                                {/* 指派狀態：讓 A 知道進度怎麼算 */}
                                {hasAssignee(n.assignee)
                                  ? (n.hasR
                                      ? <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-green-50 text-green-700 border-green-300 shrink-0">R已提交</Badge>
                                      : <Badge variant="outline" className="text-[11px] px-1.5 py-0 text-muted-foreground/50 shrink-0">R未提交</Badge>)
                                  : (n.isParent
                                      ? <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-300 shrink-0">聚合</Badge>
                                      : <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-300 shrink-0">無人·A填</Badge>)}
                                <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right shrink-0">{n.progress}%</span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* 選定任務的填寫區 — 精簡版：小標籤 + 分頁（看 R 報告 / 我要寫）*/}
                {sel && selTask && (() => {
                const asg = (selTask.assignee || '').trim()
                const assigned = hasAssignee(asg)
                const unassignedParent = !assigned && sel.isParent
                const showPrereq = !sel.isParent && selPrereqs.length > 0
                // 我要寫 / 我的報告 區塊（有押人=補充、無押人=正式報告）
                const writeArea = (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">{assigned ? '補充內容（選填，不影響進度）' : '此任務進度以你的報告為準'}</span>
                      {selDirty && <button type="button" onClick={() => setClearOpen(true)} className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-0.5"><Eraser className="h-3 w-3" />清空</button>}
                    </div>
                    <div className="rounded-lg border overflow-hidden">
                      {rs.map((row, ri) => (
                        <div key={ri} className="flex items-start gap-2 px-2 py-1.5 border-b last:border-b-0">
                          <input type="date" value={row.date} onChange={e => setRowsFor(selectedId, rs.map((r, i) => i === ri ? { ...r, date: e.target.value } : r))} className="text-xs border rounded h-[32px] px-1.5 bg-background w-[128px] shrink-0" />
                          <textarea value={row.content} onChange={e => setRowsFor(selectedId, rs.map((r, i) => i === ri ? { ...r, content: e.target.value } : r))} placeholder="工作內容…" rows={1} className="flex-1 text-xs border rounded px-2 py-1.5 resize-y min-h-[32px]" />
                          {row.attachments?.length ? <div className="mt-1"><AttachmentPill attachments={row.attachments} onRemove={ai => removeAttachment(ri, ai)} /></div> : null}
                          <button type="button" onClick={() => pickFilesForRow(ri)} disabled={uploadingRow !== null} title="上傳附件" className="text-muted-foreground/60 hover:text-primary text-xs mt-1 shrink-0 h-[24px] w-[24px] inline-flex items-center justify-center rounded hover:bg-primary/10 disabled:opacity-40">
                            {uploadingRow === ri
                              ? (uploadRowProgress > 0
                                  ? <span className="text-[11px] font-medium tabular-nums leading-none">{uploadRowProgress}%</span>
                                  : <Loader2 className="h-3.5 w-3.5 animate-spin" />)
                              : <Paperclip className="h-3.5 w-3.5" />}
                          </button>
                          {rs.length > 1 && <button onClick={() => setRowsFor(selectedId, rs.filter((_, i) => i !== ri))} className="text-muted-foreground/50 hover:text-destructive text-xs mt-1.5 shrink-0">✕</button>}
                        </div>
                      ))}
                      <button onClick={() => setRowsFor(selectedId, [...rs, { date: '', content: '' }])} className="w-full text-xs text-primary hover:bg-primary/5 py-1.5">+ 新增一列</button>
                    </div>
                    <div className="space-y-1"><div className="text-[11px] font-medium text-muted-foreground">預計下週工作（選填）</div><Textarea value={nextPlan[selectedId] || ''} onChange={e => setNextPlan(p => ({ ...p, [selectedId]: e.target.value }))} rows={1} placeholder="預計下週…" className="text-xs min-h-[36px]" /></div>
                    {selTask.completedAt ? (
                      <div className="flex items-center justify-end gap-2 pt-1 border-t"><span className="text-xs text-green-700 dark:text-green-400 inline-flex items-center gap-1"><CircleCheck className="h-3.5 w-3.5" />已完成 · {selTask.completedAt}</span></div>
                    ) : !assigned ? (
                      <div className="flex items-center justify-end gap-2 pt-1 border-t">
                        {willDone ? (
                          <>
                            <span className="text-xs text-green-700 dark:text-green-400 inline-flex items-center gap-1"><CircleCheck className="h-3.5 w-3.5" />將標記完成</span>
                            <input type="date" value={willDone} onChange={e => setMarkDone(p => ({ ...p, [selectedId]: e.target.value }))} className="text-xs border rounded h-7 px-1.5 bg-background" />
                            <button onClick={() => setMarkDone(p => { const n = { ...p }; delete n[selectedId]; return n })} className="text-xs text-muted-foreground hover:text-destructive">取消</button>
                          </>
                        ) : (
                          <button onClick={() => { const ds = rowsFor(selectedId).filter(r => r.date).map(r => r.date).sort(); setCompleteDate(ds.length ? ds[ds.length - 1] : ymd(new Date())); setCompleteOpen(true) }} className="inline-flex items-center gap-1 text-xs border border-green-300 text-green-700 rounded px-2.5 py-1 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30 transition-colors"><CircleCheck className="h-3.5 w-3.5" />標記完成…</button>
                        )}
                      </div>
                    ) : (
                      <div className="pt-1 border-t text-[11px] text-muted-foreground flex items-start gap-1"><Info className="h-3 w-3 shrink-0 mt-0.5" />完成由「R 回報 → R主管審核 → 你在『待你確認』確認」處理。</div>
                    )}
                  </div>
                )
                return (
                  <div className="border rounded-lg overflow-hidden">
                    {/* 精簡表頭：標題 + 進度 + 一排小標籤 */}
                    <div className="px-3 pt-2.5 pb-2 bg-muted/20 space-y-1.5">
                      <div className="text-[11px] text-muted-foreground truncate">{sel.path.replace('› ' + sel.title, '')}</div>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{sel.title}</div>
                          <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{new Date(selTask.startDate).toLocaleDateString('zh-TW')} ~ {new Date(selTask.endDate).toLocaleDateString('zh-TW')}</div>
                        </div>
                        <div className="w-24 shrink-0 flex items-center gap-1.5 mt-0.5"><Progress value={sel.progress} className="h-2 flex-1 bg-slate-200 dark:bg-slate-700" /><span className="text-[11px] font-medium text-muted-foreground tabular-nums w-8 text-right">{sel.progress}%</span></div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {sel.isParent && <Badge variant="outline" className="text-[11px] px-1 py-0 text-violet-600 border-violet-300">父任務</Badge>}
                        {/* 進度來源小標籤（hover 看細節）*/}
                        <HoverCard openDelay={80} closeDelay={80}>
                          <HoverCardTrigger asChild>
                            <button type="button" className={cn('inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0 rounded-full border cursor-help',
                              assigned ? 'text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-300'
                                : unassignedParent ? 'text-violet-700 border-violet-300 bg-violet-50 dark:bg-violet-950/20 dark:text-violet-300'
                                  : 'text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300')}>
                              <Info className="h-3 w-3" />{assigned ? `指派 ${asg}` : unassignedParent ? '無指派人·子項聚合' : '無指派人·你填報'}
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent align="start" className="w-64 p-2.5 text-xs">
                            {assigned ? <>此任務由 <b>{asg}</b> 負責，<b>進度以 R 報告為準</b>；你寫的是補充，不影響進度。</>
                              : unassignedParent ? <>無指派人的父任務，進度<b>由子項自動聚合</b>（目前 {sel.progress}%），無需填寫。</>
                                : <>此任務無指派人，<b>進度以你（A）的報告為準</b>。</>}
                          </HoverCardContent>
                        </HoverCard>
                        {/* 前序未完成小標籤（點看細節）*/}
                        {showPrereq && <button type="button" onClick={() => setPrereqOpen(true)} className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0 rounded-full border border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 hover:bg-amber-100"><AlertTriangle className="h-3 w-3" />前序未完成 {selPrereqs.length}</button>}
                        {/* 逾期 / 延期小標籤 */}
                        {!unassignedParent && pendingDelayTaskIds.has(selectedId) && <Badge variant="outline" className="text-[11px] px-1.5 py-0 border-orange-400 bg-orange-100/60 text-orange-700 dark:text-orange-300">延期待審</Badge>}
                        {!unassignedParent && !pendingDelayTaskIds.has(selectedId) && selOverdue && <button type="button" onClick={() => openDelay()} className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0 rounded-full border border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 hover:bg-orange-100"><CalendarClock className="h-3 w-3" />逾期 {selOverdue.diffDays} 天·申請延期</button>}
                      </div>
                    </div>

                    {/* 內容區 */}
                    {unassignedParent ? (
                      <div className="px-3 py-5 text-center text-xs text-muted-foreground">此父任務由子項自動聚合，無需填寫。</div>
                    ) : assigned ? (
                      <>
                        <div className="flex border-b bg-background px-3">
                          {([['r', '看 R 報告', selRAll.length], ['write', '我的補充', 0]] as const).map(([v, label, cnt]) => (
                            <button key={v} type="button" onClick={() => setTaskTab(v)} className={cn('px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5', taskTab === v ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                              {label}
                              {v === 'r' && cnt > 0 && <span className={cn('inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-medium tabular-nums', taskTab === 'r' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{cnt}</span>}
                            </button>
                          ))}
                        </div>
                        <div className="p-3">
                          {taskTab === 'r' ? (
                            <div className="space-y-2">
                              {selRAll.length === 0 ? (
                                <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">此任務尚無 R 報告</div>
                              ) : (
                                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                                  {selRAll.map(l => (
                                    <div key={l.id} className="text-xs leading-relaxed flex items-start gap-1.5 px-1.5 py-1 rounded hover:bg-muted/40">
                                      <span className="text-muted-foreground tabular-nums shrink-0 mt-px">{new Date(l.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
                                      {l.weekOf === weekOf && <span className="text-[9px] px-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0 mt-px">本週</span>}
                                      <span className="text-foreground/85 whitespace-pre-wrap flex-1 min-w-0">{l.content}</span>
                                      {l.attachments?.length ? <span className="shrink-0"><AttachmentPill attachments={l.attachments} /></span> : null}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {sel.isParent && selKidLogs.length > 0 && <div className="text-right"><button type="button" onClick={() => { importKids(); setTaskTab('write') }} className="text-[11px] text-violet-600 hover:underline">帶入子任務報告（{selKidLogs.length}）到我的補充</button></div>}
                            </div>
                          ) : writeArea}
                        </div>
                      </>
                    ) : (
                      <div className="p-3">{writeArea}</div>
                    )}
                  </div>
                  )
                })()}
              </>
            )}
          </div>

          <input ref={uploadRef} type="file" multiple className="hidden" accept=".xls,.xlsx,.csv,.ppt,.pptx,.doc,.docx,.txt,.md,.pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.zip,.rar,.7z" onChange={handleUpload} />
          <div className="px-6 py-3 border-t flex items-center justify-between gap-2 bg-muted/20">
            <div className="text-xs min-w-0">
              {incompleteRows.length > 0
                ? <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />有 {incompleteRows.length} 筆紀錄只填了日期或內容，請補齊或刪除該列</span>
                : duplicateDateTasks.length > 0
                ? <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />有任務在同一天填了多列，同一天視為同一筆會互相覆蓋，請併到同一列</span>
                : <span className="text-muted-foreground">本週報告 {reportCount} 項{doneCount > 0 && <>，標記完成 <span className="text-green-600 font-medium">{doneCount}</span></>}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" className="gap-1.5" disabled={savingDraft || saving || loading} onClick={saveDraft}>
                {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : draftDone ? <Check className="h-4 w-4 text-green-600" /> : <Save className="h-4 w-4" />}
                {draftDone ? '已暫存' : '暫存草稿'}
              </Button>
              <Button className="gap-1.5 font-medium shadow-sm" disabled={saving || savingDraft || loading || incompleteRows.length > 0 || duplicateDateTasks.length > 0} onClick={onClickSubmit}><Send className="h-4 w-4" />送出本週報告</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 甘特預覽（重用原本模板，反映目前尚未送出的暫定變更）*/}
      <Dialog open={ganttPreviewOpen} onOpenChange={setGanttPreviewOpen}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-500" />甘特預覽</DialogTitle>
            <DialogDescription>依你目前填的報告日期、標記完成、申請延期即時產生（<b>尚未送出</b>）。灰＝預計、實色＝實際。</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {ganttPreviewOpen && (
              <GanttChart
                milestones={previewGantt.milestones}
                tasks={previewGantt.tasks}
                taskLogs={previewGantt.taskLogs}
                startDate={previewGantt.start}
                endDate={previewGantt.end}
                showBaseline
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 查看 R 報告 */}
      <AlertDialog open={rViewOpen} onOpenChange={setRViewOpen}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Inbox className="h-4 w-4 text-blue-600" />R 的報告 · {sel?.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">下方是團隊成員本週對此任務的紀錄。你可「匯入」當成自己報告的草稿,再自行編修。</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-[52vh] overflow-y-auto -mx-1 px-1">
            {selRLogs.map(l => (
              <div key={l.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-blue-600 text-white text-[11px] font-medium flex items-center justify-center shrink-0">{l.author.split(' ').map(x => x[0]).join('').slice(0, 2)}</div>
                  <span className="text-sm font-medium">{l.author}</span>
                  <Badge variant="outline" className="text-[11px] font-mono px-1.5 py-0 ml-auto">{new Date(l.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</Badge>
                </div>
                <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{l.content}</div>
                {l.attachments?.length ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">附件：<AttachmentPill attachments={l.attachments} /></div>
                ) : null}
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>關閉</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); importR() }} className="gap-1.5"><CornerDownLeft className="h-4 w-4" />匯入我的報告</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 清空確認 */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空「{sel?.title}」的報告？</AlertDialogTitle>
            <AlertDialogDescription>會清掉<b>這個任務</b>你已填/匯入的內容(含下週計畫、標記完成),<b>只清這一個任務</b>,其他任務不受影響。清掉後無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); clearSel() }}>確定清空</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 送出確認 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認送出本週報告？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2"><Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /><span>你填了 <b>{reportCount}</b> 項工作報告，送出後會出現在專案的「更新紀錄」，團隊都看得到。</span></div>
                {doneCount > 0 && (
                  <>
                    <div className="flex items-start gap-2"><CircleCheck className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /><span>你把 <b>{doneCount}</b> 個任務標記完成，送出後進度更新為 100%：</span></div>
                    <div className="rounded-lg border bg-muted/30 p-2 space-y-1.5 ml-6">
                      {donePreview.map(d => (
                        <div key={d.id} className="flex items-center gap-2 text-xs">
                          <CircleCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground truncate">{d.title}</div>
                            <div className="text-[11px] text-muted-foreground truncate">里程碑：{d.msName}</div>
                          </div>
                          <span className="tabular-nums text-muted-foreground shrink-0">{d.from}%</span>
                          <span className="text-muted-foreground shrink-0">→</span>
                          <span className="tabular-nums font-medium text-green-600 shrink-0">100%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {overdueUnresolved.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-2 text-xs text-orange-800 dark:text-orange-300">
                    <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>有 <b>{overdueUnresolved.length}</b> 筆填報日超過規劃截止日，該任務已逾期（進度最高到 99%、無法標記完成）。<b>建議送出延期申請</b>調整時程，才能正常完成這些任務。</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground pt-1">送出後仍可再進來修改。</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>返回</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doSubmit() }} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '確定送出'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 前序守則 —— 精簡三選一 */}
      <AlertDialog open={prereqOpen} onOpenChange={o => { if (!completingPrereq) setPrereqOpen(o) }}>
        <AlertDialogContent className="sm:max-w-sm">
          {/* 右上角 ⓘ：hover 顯示會被一鍵標 100% 的清單 */}
          {prereqTodoTasks.length > 0 && (
            <HoverCard openDelay={80} closeDelay={80}>
              <HoverCardTrigger asChild>
                <button type="button" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><AlertCircle className="h-4 w-4" /></button>
              </HoverCardTrigger>
              <HoverCardContent align="end" className="w-64 p-2">
                <div className="text-[11px] font-medium text-muted-foreground mb-1.5">按「前序皆已完成」會把這 {prereqTodoTasks.length} 項標記 100%：</div>
                <div className="max-h-[240px] overflow-y-auto">
                  {prereqTreeItems.map((t, i) => {
                    const prevMs = i > 0 ? prereqTreeItems[i - 1].msName : null
                    return (
                      <div key={t.id}>
                        {t.msName !== prevMs && <div className="text-[11px] font-semibold text-muted-foreground/70 px-1 pt-1 pb-0.5">{t.msName}</div>}
                        <div className="flex items-center gap-1 text-xs py-0.5" style={{ paddingLeft: 4 + t.depth * 14 }}>
                          {t.depth > 0 && <span className="text-muted-foreground/40 -ml-2.5 mr-0.5">└</span>}
                          <CircleCheck className="h-3 w-3 text-green-500 shrink-0" />
                          <span className="truncate flex-1">{t.title}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />前序尚未完成</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">「{sel?.title}」需先完成前序里程碑<b>「{prereqMilestones.map(m => m.name).join('」「')}」</b>。</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2">
            <Button className="gap-1.5 bg-green-600 hover:bg-green-700" disabled={completingPrereq || prereqTodoTasks.length === 0} onClick={completePrereqMilestones}>
              {completingPrereq ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />}前序皆已完成（一鍵標 100%）
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={completingPrereq} onClick={() => setPrereqOpen(false)}>繼續填目前</Button>
              {prereqJumpTarget && (
                <Button variant="outline" className="flex-1 gap-1" disabled={completingPrereq} onClick={() => { const t = prereqJumpTarget; setSelectedId(t.id); setPrereqOpen(false); if (incompletePrereqsOf(t.id).length > 0) setTimeout(() => setPrereqOpen(true), 0) }}>
                  <CornerDownLeft className="h-4 w-4" />先做前序
                </Button>
              )}
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* 申請延期（撰寫台內，兩步：填寫 → 確認） */}
      <AlertDialog open={delayOpen} onOpenChange={o => { if (!delaySubmitting) setDelayOpen(o) }}>
        <AlertDialogContent className={cn('transition-all', delayStep === 'confirm' ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-orange-500" />申請延期 · {sel?.title}
              <span className="ml-auto flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                <span className={cn('h-1.5 w-1.5 rounded-full', delayStep === 'confirm' ? 'bg-orange-500' : 'bg-muted')} />
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">{delayStep === 'form' ? '選擇新截止日，下方即時顯示影響。' : '送出後進入審核，核准後始重算時程。'}</AlertDialogDescription>
          </AlertDialogHeader>

          {delayStep === 'form' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border p-2"><div className="text-muted-foreground">目前截止</div><div className="font-medium mt-0.5">{selTask && new Date(selTask.endDate).toLocaleDateString('zh-TW')}</div></div>
                <div className="rounded border p-2 border-orange-300 bg-orange-50/50 dark:bg-orange-950/10"><div className="text-muted-foreground mb-0.5">新截止日 <span className="text-destructive">*</span></div><input type="date" value={delayDate} min={selTask ? ymd(new Date(new Date(selTask.endDate).getTime() + 86400000)) : undefined} onChange={e => setDelayDate(e.target.value)} className="text-xs border rounded h-7 px-1.5 bg-background w-full" /></div>
              </div>
              {/* 這個日期會造成什麼（含下游，整合成一個提醒）*/}
              {delayImpact ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-2.5 text-xs text-orange-800 dark:text-orange-300 space-y-1">
                  <div className="font-medium flex items-center gap-1"><Info className="h-3.5 w-3.5" />這個日期會造成：</div>
                  <div>• 此任務延後 <b>{delayImpact.extraDays}</b> 天</div>
                  <div>• {delayImpact.milestoneDelta > 0 ? <>里程碑「{delayImpact.msName}」順延至 <b>{new Date(delayImpact.proposedMilestoneDate).toLocaleDateString('zh-TW')}</b>（+{delayImpact.milestoneDelta} 天）</> : <>不影響里程碑「{delayImpact.msName}」的截止日</>}</div>
                  {delayImpact.extraDays > 0 && subsequentMilestones.length > 0 && <div>• 其後 <b>{subsequentMilestones.length}</b> 個里程碑順延 {delayImpact.extraDays} 天：「{subsequentMilestones.map(m => m.name).join('」「')}」</div>}
                </div>
              ) : delayDate ? <div className="text-xs text-destructive">新截止日必須晚於目前截止日（{selTask && new Date(selTask.endDate).toLocaleDateString('zh-TW')}）</div> : <div className="text-xs text-muted-foreground">請先選擇新的截止日。</div>}
              <div><div className="text-xs font-medium mb-1">延期原因 <span className="text-destructive">*</span></div><Textarea value={delayReason} onChange={e => setDelayReason(e.target.value)} rows={2} placeholder="說明延期原因…" className="text-sm" /></div>
              <div><div className="text-xs font-medium mb-1">需要的支援（選填）</div><Input value={delaySupport} onChange={e => setDelaySupport(e.target.value)} placeholder="需要協調的資源 / 人力…" className="h-8 text-sm" /></div>
            </div>
          ) : (
            <div className="rounded-lg border divide-y text-sm">
              <div className="flex items-center justify-between px-3 py-2"><span className="text-xs text-muted-foreground">任務</span><span className="font-medium">{sel?.title}</span></div>
              <div className="flex items-center justify-between px-3 py-2"><span className="text-xs text-muted-foreground">截止日</span><span className="font-medium">{selTask && new Date(selTask.endDate).toLocaleDateString('zh-TW')} → <span className="text-orange-600">{new Date(delayDate).toLocaleDateString('zh-TW')}</span><span className="text-muted-foreground text-xs ml-1">（+{delayImpact?.extraDays} 天）</span></span></div>

              {/* 甘特視覺化：原定區間(灰) vs 延後區間(橘) */}
              <div className="px-3 py-3 space-y-3">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">里程碑時程變化</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-slate-300 dark:bg-slate-600" />原定</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-orange-500" />延後</span>
                </div>
                {delayPreviewRows.map(r => (
                  <div key={r.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="truncate flex-1 font-medium">{r.name}</span>
                      <span className="text-muted-foreground shrink-0 tabular-nums">{new Date(r.oe).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} → <span className="text-orange-600 font-medium">{new Date(r.ne).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span> <span className="text-orange-600">(+{r.delta})</span></span>
                    </div>
                    <div className="rounded bg-muted/40 px-1 py-1.5 space-y-2">
                      <div className="relative h-2.5">
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border/60" />
                        <div className="absolute top-0 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" style={{ left: `${r.osPct}%`, width: `${Math.max(1.5, r.oePct - r.osPct)}%` }} />
                      </div>
                      <div className="relative h-2.5">
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border/60" />
                        <div className="absolute top-0 h-2.5 rounded-sm bg-orange-500" style={{ left: `${r.nsPct}%`, width: `${Math.max(1.5, r.nePct - r.nsPct)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                {subsequentMilestones.length > 0 && <div className="text-xs text-muted-foreground pt-1 border-t">＊其後里程碑為順延預估，任務不自動連動（各自獨立、手動調整）。</div>}
              </div>

              <div className="flex items-start justify-between px-3 py-2 gap-3"><span className="text-xs text-muted-foreground shrink-0">原因</span><span className="text-xs text-right whitespace-pre-wrap">{delayReason}</span></div>
              {delaySupport.trim() && <div className="flex items-start justify-between px-3 py-2 gap-3"><span className="text-xs text-muted-foreground shrink-0">需要支援</span><span className="text-xs text-right whitespace-pre-wrap">{delaySupport}</span></div>}
            </div>
          )}

          <AlertDialogFooter>
            {delayStep === 'form' ? (
              <>
                <AlertDialogCancel disabled={delaySubmitting}>取消</AlertDialogCancel>
                <Button onClick={() => setDelayStep('confirm')} disabled={!delayImpact || !delayReason.trim()} className="bg-orange-600 hover:bg-orange-700 gap-1.5">下一步：確認<CornerDownLeft className="h-4 w-4 rotate-180" /></Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDelayStep('form')} disabled={delaySubmitting}>返回修改</Button>
                <AlertDialogAction onClick={e => { e.preventDefault(); submitDelay() }} disabled={delaySubmitting} className="bg-orange-600 hover:bg-orange-700">{delaySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : delayDone ? <><Check className="h-4 w-4" />已送出</> : '確定送出延期申請'}</AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 關閉前提醒：有未儲存內容 */}
      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>離開前先儲存？</AlertDialogTitle>
            <AlertDialogDescription>你有<b>尚未送出／暫存</b>的內容，直接關閉將不會保存本週報告。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="mt-0">返回繼續編輯</AlertDialogCancel>
            <Button variant="outline" disabled={savingDraft} onClick={async () => { const ok = await saveDraft(); if (ok) { setCloseConfirmOpen(false); onOpenChange(false) } }}>{savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : '暫存並關閉'}</Button>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { setCloseConfirmOpen(false); onOpenChange(false) }}>不儲存，直接關閉</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 標記完成 小流程 */}
      <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-green-600" />標記完成 · {sel?.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">請填<b>實際完成日</b>（非填報日）。送出報告時生效、進度變 100%。</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2.5 text-sm">
            {!selHasLog && <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-2 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />請先填寫至少一筆工作紀錄（日期＋內容）再標記完成。</div>}
            {selPrereqs.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-2 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />前序未完成：{selPrereqs.map(p => p.title).join('、')}。仍可標記，但建議先完成前序。</span><Button size="sm" variant="outline" className="h-6 text-[11px] px-2 shrink-0" onClick={() => setPrereqOpen(true)}>查看</Button></div>}

            {/* 一律讓她填實際完成日；以「填的日期」判斷是否逾期，而非填報日 */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground shrink-0">實際完成日</span>
              <input type="date" value={completeDate} onChange={e => setCompleteDate(e.target.value)} className={cn('text-xs border rounded h-8 px-2 bg-background', completeOverdue && 'border-orange-400')} />
              <span className="text-[11px] text-muted-foreground">截止日 {selTask && new Date(selTask.endDate).toLocaleDateString('zh-TW')}</span>
            </div>

            {/* 只有「實際完成日」超過截止日才要求延期 */}
            {completeOverdue && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-2.5 text-xs text-orange-800 dark:text-orange-300 space-y-2">
                <div className="font-medium flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 shrink-0" />實際完成日已逾截止日</div>
                <div>須申請延期調整時程後始可結案；如於期限內完成，請改填截止日當日或之前。</div>
                <Button size="sm" className="w-full h-8 text-xs bg-orange-600 hover:bg-orange-700 gap-1.5" onClick={() => { setCompleteOpen(false); openDelay(completeDate) }}><CalendarClock className="h-3.5 w-3.5" />申請延期</Button>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>返回繼續填寫</AlertDialogCancel>
            <AlertDialogAction disabled={!selHasLog || completeOverdue} onClick={e => { e.preventDefault(); if (selectedId) { setMarkDone(p => ({ ...p, [selectedId]: completeDate })); setCompleteOpen(false) } }} className="bg-green-600 hover:bg-green-700">確認標記完成</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
