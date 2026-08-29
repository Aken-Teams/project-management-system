'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/lib/auth-context'
import { isSameUser } from '@/lib/user-match'
import { uploadFile } from '@/lib/upload-file'
import { weekEndOf, shouldTrackReport, isOverdueForWeek, reportCountsForWeek, buildTrackTree } from '@/lib/report-tracking'
import { isReportVisible, isRejectionTracked, isWithinRevokeWindow, REVOKE_WINDOW_DAYS } from '@/lib/report-cutoff'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { type Task, type TaskLog, type TaskLogAttachment, type SubTask, type Project } from '@/lib/mock-data'
import { VoiceInputButton } from '@/components/voice-input-button'
import { ProjectEditDialog, type ProjectEditData } from '@/components/project-edit-dialog'
import { WeekPicker } from '@/components/ui/week-picker'
import {
  buildReviewFlow,
  buildFlowFromSummary,
  ReviewPipelineBar,
  ReviewFlowTimeline,
  ReviewFlowEmpty,
  ReviewFlowCollapsed,
  StageLensHeader,
  StageChip,
  FlowAvatar,
  type FlowStage,
  type FlowPanelTab,
  type PipelineCounts,
  type ReviewFlow,
  formatWeekLabel,
} from '@/components/review-flow-panel'
import {
  computeTaskStatus,
  getStatusLabel,
  getStatusColor,
  getDaysUntilDeadline,
  type ComputedTaskStatus,
} from '@/lib/task-utils'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Calendar,
  Send,
  CalendarClock,
  CircleCheck,
  Undo2,
  PenLine,
  ChevronDown,
  ChevronRight,
  PanelRightClose,
  CalendarDays,
  CheckCircle2,
  Clock,
  AlertCircle,
  ListChecks,
  ArrowRight,
  ArrowLeft,
  Info,
  ImagePlus,
  Paperclip,
  Loader2,
  Pencil,
  ChevronsUpDown,
  Trash2,
  Check,
  X,
  Sparkles,
  FileText,
  ClipboardList,
  UserCheck,
  UserX,
  HelpCircle,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@/components/ui/command'

/** Add one day to a YYYY-MM-DD string */
function addOneDayStr(dateStr: string) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

/** Compute day difference between two YYYY-MM-DD strings (b - a) */
function dayDiff(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24))
}

/** Compute parent task progress as weighted average of subtask progress (by durationDays) */
function computeParentProgress(subtasks: SubTask[]): number {
  if (!subtasks || subtasks.length === 0) return -1 // -1 means no subtasks, use task's own progress
  const totalDays = subtasks.reduce((sum, s) => sum + (s.durationDays || 1), 0)
  if (totalDays === 0) return 0
  const weightedSum = subtasks.reduce((sum, s) => sum + (s.progress || 0) * (s.durationDays || 1), 0)
  return Math.round(weightedSum / totalDays)
}

function getStatusDot(status: ComputedTaskStatus) {
  const colors: Record<ComputedTaskStatus, string> = {
    completed: 'bg-green-500',
    'on-track': 'bg-blue-500',
    'at-risk': 'bg-amber-500',
    overdue: 'bg-red-500',
    'overdue-not-started': 'bg-orange-500',
    'not-started': 'bg-gray-300',
  }
  return <div className={cn('h-2 w-2 rounded-full shrink-0', colors[status])} />
}

function getStatusBadge(status: ComputedTaskStatus) {
  return (
    <Badge className={cn('text-xs px-2 py-0.5 shrink-0', getStatusColor(status))}>
      {getStatusLabel(status)}
    </Badge>
  )
}

interface MilestoneTaskGroup {
  milestoneId: string
  milestoneName: string
  milestoneDueDate: string
  tasks: Task[]
}

// 填寫週報彈窗：依「里程碑 › 父任務 › …」完整路徑分組的任務群
type RTaskGroup = { key: string; pathLabel: string; dueDate: string; tasks: Task[] }

interface MyTasksProject {
  id: string
  name: string
  startDate?: string
  userRole?: string
  milestones: { id: string; name: string; dueDate: string; status: string; progress: number; sortOrder?: number }[]
  tasks: Task[]
  taskLogs: TaskLog[]
  reviewEvents?: RReviewEvent[]
  // 每位成員在此專案的報告審核主管；reviewer=null 代表未指定 → 後端 fallback 由當責代審
  memberReviewers?: { name: string; reviewer: string | null }[]
  /** 本專案當責(A)姓名，供流程圖顯示「下一棒是誰」 */
  accountableName?: string | null
  pendingDelayMilestoneIds?: string[]
  pendingDelayProposedDates?: Record<string, string>
}

// 任務審視歷程事件
type RReviewEvent = { id: string; taskId: string; taskTitle: string; path?: string | null; assignee: string; type: 'reported' | 'cancelled' | 'confirmed' | 'rejected' | string; actor: string; note?: string | null; createdAt: string; projectId?: string }

// 審核中心：一筆待審項目（logRows 含此任務 + 所有子任務的紀錄，附件掛在各列）
// R 報告審核主管收件匣型別（督導總覽：每 R 的待審 + 已審核 + 追蹤狀態）
type ReviewLogItem = { id: string; logDate: string; content: string; attachments: TaskLogAttachment[]; nextPlans: { date?: string; content: string }[]; status?: 'pending' | 'approved' | 'rejected'; createdAt?: string; supplement?: boolean }
type ReviewSubmission = {
  taskId: string; taskTitle: string; weekOf: string | null
  /** 補充的批次：同一週送兩次就是兩批，各自審核與撤回 */
  batch?: string | null
  reportedDone: boolean
  /** 執行者在任務完成後補交的資料——審核照走，但不影響完成日與進度 */
  supplement?: boolean
  /** 補充：主管已核准，正等當責收尾 */
  reviewerApproved?: boolean
  logs: ReviewLogItem[]
}
type ReviewedSubmission = {
  taskId: string; taskTitle: string; weekOf: string | null
  batch?: string | null
  outcome: 'approved' | 'rejected'; note: string | null; reviewedAt: string
  supplement?: boolean
  reviewerApproved?: boolean
  /** 已真正進更新紀錄；補充在當責通過前是 false */
  published?: boolean
  reportedDone?: boolean
  completed?: boolean
  logs: ReviewLogItem[]
}
type TrackingItem = {
  taskId: string; taskTitle: string; depth: number; owned: boolean; done: boolean; msName: string | null
  planStart: string; planEnd: string
  overdue: boolean; reportedDone: boolean; filled: boolean
  /** 本週的報告狀態——用來判斷「本週誰沒交」 */
  reviewState: 'none' | 'pending' | 'published' | 'rejected'
  /** 任務層級的報告狀態（不限週別）——流程時間軸用這個，才會與 A 端一致 */
  taskReviewState: 'none' | 'pending' | 'published' | 'rejected'
  taskSubmittedAt: string | null
  taskDecidedAt: string | null
  taskRejectNote: string | null
  taskLegacy: boolean
  reviewedAt: string | null
  reviewedBy: string | null
  completedAt: string | null
  completedBy: string | null
  logs: ReviewLogItem[]
}
type Reviewee = {
  authorId: string; authorName: string; authorEmail: string
  pending: ReviewSubmission[]; reviewed: ReviewedSubmission[]
  submittedThisWeek: boolean; openTaskCount: number
  tracking: TrackingItem[]
}
type ReviewProject = { projectId: string; projectName: string; accountableName?: string | null; reviewees: Reviewee[] }

type ReviewLogRow = { log: TaskLog; srcTitle?: string }
type ReviewItem = { projectId: string; projectName: string; task: Task; path: string; reporter: string; reportedAt: string; logRows: ReviewLogRow[]; fileCount: number }

// A 視角：某任務本週報告的「R主管審核狀態」
//   none=未填 / pending=主管審核中 / published=已進更新紀錄 / rejected=被主管駁回
type ReportReviewState = { kind: 'none' | 'pending' | 'published' | 'rejected'; reviewerName: string | null; waitDays: number }
function computeReportReviewState(logs: TaskLog[]): ReportReviewState {
  if (logs.length === 0) return { kind: 'none', reviewerName: null, waitDays: 0 }
  // pending 優先：只要有「未審核」的報告（含在已通過報告上重新補充送出），整體就是「審核中」。
  //   否則 R 重送後，A 會因為週內還有一筆舊的已發布報告而誤顯示「已進紀錄」。
  const pending = logs.filter(l => !l.publishedAt && !l.reviewerRejectedAt)
  if (pending.length > 0) {
    const reviewerName = pending.map(l => l.authorReviewerName).find(Boolean) ?? null
    const earliest = pending.reduce((min, l) => (l.createdAt < min ? l.createdAt : min), pending[0].createdAt)
    const waitDays = Math.max(0, Math.floor((Date.now() - new Date(earliest).getTime()) / 86400000))
    return { kind: 'pending', reviewerName, waitDays }
  }
  if (logs.some(l => l.publishedAt)) return { kind: 'published', reviewerName: null, waitDays: 0 }
  return { kind: 'rejected', reviewerName: logs.map(l => l.authorReviewerName).find(Boolean) ?? null, waitDays: 0 }
}

// 依任務樹狀節點
type ReviewTaskNode = { taskId: string; title: string; assignee: string; depth: number; active: boolean; filled: boolean; reported: boolean; reviewed: boolean; completed: boolean; logs: TaskLog[]; reviewState: ReportReviewState; children: ReviewTaskNode[] }

// 把填報週(週一 YYYY-MM-DD)格式化成清楚的「2026W30 · 7/20~7/26」，讓 R主管/A 一眼知道是哪一週的報告
function formatReportWeek(monday: string | null): string | null {
  if (!monday) return null
  const [y, m, d] = monday.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 6)
  const md = (dt: Date) => `${dt.getMonth() + 1}/${dt.getDate()}`
  const iso = new Date(Date.UTC(y, m - 1, d))
  const dayNum = iso.getUTCDay() || 7
  iso.setUTCDate(iso.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(iso.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((iso.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${iso.getUTCFullYear()}W${String(week).padStart(2, '0')} · ${md(start)}~${md(end)}`
}

// 審視事件顯示樣式（不綁角色，操作者由「操作人」欄呈現）
const REVIEW_EVENT_META: Record<string, { label: string; cls: string }> = {
  reported: { label: '回報完成', cls: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400' },
  cancelled: { label: '取消回報', cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400' },
  confirmed: { label: '審核通過', cls: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: '退回', cls: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400' },
  // R 報告審核主管流程
  report_submitted: { label: '送出待審', cls: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400' },
  report_approved: { label: '主管核准', cls: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400' },
  report_rejected: { label: '主管駁回', cls: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400' },
  // 撤回（流程往回退一棒）
  confirm_revoked: { label: '撤回確認', cls: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400' },
  report_approve_revoked: { label: '撤回核准', cls: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400' },
}

export default function MyTasksPage() {
  const { user } = useAuth()

  const [apiProjects, setApiProjects] = useState<MyTasksProject[]>([])
  const [loading, setLoading] = useState(true)
  // R 報告審核主管收件匣（我要審核的成員報告）
  const [reviewInbox, setReviewInbox] = useState<ReviewProject[]>([])
  const [isReviewer, setIsReviewer] = useState(false) // 我是否為任何人的報告審核主管
  // 填報追蹤：篩選人（'all' 或某成員 id）＋ 依人收合展開（預設全收合）
  const [trackPersonFilter, setTrackPersonFilter] = useState<string>('all')
  const [trackPersonPickerOpen, setTrackPersonPickerOpen] = useState(false)
  const [trackExpandedPersons, setTrackExpandedPersons] = useState<Set<string>>(new Set())
  const toggleTrackPerson = (id: string) => setTrackExpandedPersons(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  // 填報追蹤所選週別（週一 YYYY-MM-DD），預設本週
  const [reviewTrackWeek, setReviewTrackWeek] = useState(() => {
    const now = new Date(); const day = now.getDay(); const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const mon = new Date(now); mon.setDate(diff)
    return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
  })
  const refetchReviewInbox = useCallback(async (week?: string) => {
    if (!user?.email) return
    const w = week ?? reviewTrackWeek
    try {
      const res = await fetch(`/api/report-reviews?email=${encodeURIComponent(user.email)}&week=${w}`)
      if (res.ok) { const d = await res.json(); setReviewInbox(d.projects ?? []); setIsReviewer(!!d.isReviewer) }
    } catch { /* ignore */ }
  }, [user?.email, reviewTrackWeek])
  const onTrackWeekChange = useCallback((w: string) => { setReviewTrackWeek(w); refetchReviewInbox(w) }, [refetchReviewInbox])
  useEffect(() => { refetchReviewInbox() }, [refetchReviewInbox])
  // 視窗重新聚焦時重抓（Alice 切去別的 session 送報告後切回來）
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refetchReviewInbox() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible) }
  }, [refetchReviewInbox])
  // 審查報告：核准 / 駁回
  const [reviewBusy, setReviewBusy] = useState<string | null>(null) // submission key 處理中
  const [rejectTarget, setRejectTarget] = useState<{ projectId: string; authorId: string; authorName: string; sub: ReviewSubmission } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [reviewDialogProjectId, setReviewDialogProjectId] = useState<string | null>(null)
  const reviewDialogProject = useMemo(() => reviewInbox.find(p => p.projectId === reviewDialogProjectId) || null, [reviewInbox, reviewDialogProjectId])
  const [reviewDialogTab, setReviewDialogTab] = useState<'pending' | 'reviewed' | 'tracking'>('pending')
  // ── 主管端流程面板：右欄顯示所選項目的完整審核鏈 ──
  const [supFlowKey, setSupFlowKey] = useState<string | null>(null)
  // 棒次視角：母體＝該週的填報追蹤，用來追「誰還沒交」與「誰卡在哪一棒」
  const [supStageFilter, setSupStageFilter] = useState<FlowStage | null>(null)
  // 待審核／已審核的視角：依成員 或 依任務（週別沿用填報追蹤那組，三個分頁看同一週）
  const [supViewBy, setSupViewBy] = useState<'member' | 'task'>('member')
  // 預設收斂到單一週別；被濾掉的筆數會標示出來，可一鍵展開全部
  const [supShowAllWeeks, setSupShowAllWeeks] = useState(false)
  const subKey = (projectId: string, authorId: string, s: ReviewSubmission) => `${projectId}:${authorId}:${s.taskId}:${s.weekOf ?? '_'}:${s.batch ?? '_'}`
  // 選取鍵：與對話框內 keyOf() 同格式，右欄才對得上左欄那一列
  const supRowKey = (projectId: string, authorId: string, taskId: string, weekOf: string | null, batch: string | null = null) => `${projectId}:${authorId}:${taskId}:${weekOf ?? '_'}:${batch ?? '_'}`

  // 主管端：把「待審核 / 已審核 / 填報追蹤」三份資料統一成同一條四棒流程。
  // 管線計數以「填報追蹤」為母體（它才是本週該追的完整清單），待審/已審只是同一批任務的不同切面。
  const supFlows = useMemo(() => {
    const map = new Map<string, ReviewFlow>()
    const logs = new Map<string, ReviewLogItem[]>()
    // 右欄「通過／駁回」按鈕需要的原始待審項目
    const actionable = new Map<string, { authorId: string; authorName: string; sub: ReviewSubmission }>()
    const counts: PipelineCounts = { unfilled: 0, supervisor: 0, accountable: 0, done: 0, running: 0 }
    const proj = reviewDialogProject
    if (!proj) return { map, counts, logs, actionable }
    const attOf = (logs: ReviewLogItem[]) => logs.reduce((n, l) => n + (l.attachments?.length ?? 0), 0)
    const firstAt = (logs: ReviewLogItem[]) =>
      logs.reduce<string | null>((min, l) => { const t = l.createdAt ?? l.logDate; return !min || t < min ? t : min }, null)

    for (const rv of proj.reviewees) {
      for (const t of rv.tracking) {
        if (!t.owned) continue // 上層節點只提供層級脈絡，不是待辦
        // 全部走任務層級，與 A／R 用同一套推導——同一個任務在三個角色看到的必須是同一條流程。
        // 「誰本週沒交」不在這裡處理，由「填報追蹤」分頁負責（那本來就是週別限定的視圖）。
        const f = buildFlowFromSummary({
          taskId: t.taskId, title: t.taskTitle, assignee: rv.authorName,
          path: t.msName,
          reportKind: t.taskReviewState, legacy: t.taskLegacy,
          reportedDone: t.reportedDone, completed: t.done,
          activeThisWeek: t.owned && !t.filled, weekOf: reviewTrackWeek, overdue: t.overdue,
          submittedAt: t.taskSubmittedAt, decidedAt: t.taskDecidedAt, rejectNote: t.taskRejectNote,
          reviewedAt: t.reviewedAt, reviewedBy: t.reviewedBy,
          completedAt: t.completedAt, completedBy: t.completedBy,
          reviewerName: user?.name ?? null, accountableName: proj.accountableName ?? null,
          attachments: attOf(t.logs), logCount: t.logs.length,
        })
        map.set(`track:${rv.authorId}:${t.taskId}`, f)
        logs.set(`track:${rv.authorId}:${t.taskId}`, t.logs)
      }
      for (const sub of rv.pending) {
        const k = supRowKey(proj.projectId, rv.authorId, sub.taskId, sub.weekOf, sub.batch ?? null)
        logs.set(k, sub.logs)
        actionable.set(k, { authorId: rv.authorId, authorName: rv.authorName, sub })
        map.set(k, buildFlowFromSummary({
          taskId: sub.taskId, title: sub.taskTitle, assignee: rv.authorName,
          supplement: sub.supplement, reviewerApproved: sub.reviewerApproved,
          reportKind: 'pending', reportedDone: sub.reportedDone, completed: false,
          activeThisWeek: true, weekOf: sub.weekOf, submittedAt: firstAt(sub.logs),
          reviewerName: user?.name ?? null, accountableName: proj.accountableName ?? null,
          attachments: attOf(sub.logs), logCount: sub.logs.length,
        }))
      }
      for (const sub of rv.reviewed) {
        const k = supRowKey(proj.projectId, rv.authorId, sub.taskId, sub.weekOf, sub.batch ?? null)
        logs.set(k, sub.logs)
        const f = buildFlowFromSummary({
          taskId: sub.taskId, title: sub.taskTitle, assignee: rv.authorName,
          supplement: sub.supplement, reviewerApproved: sub.reviewerApproved,
          // 補充經主管核准後仍未進更新紀錄（要等當責），此時不能算 published，
          //   否則棒次會直接跳到「已完成」，跟當責端的「待你處理」對不起來。
          reportKind: sub.outcome === 'rejected' ? 'rejected' : (sub.published === false ? 'pending' : 'published'),
          // 照實帶任務狀態：寫死 false 會讓已完成任務的舊報告被算成「執行中」，
          //   跟當責端看到的「已完成」對不起來（實際踩過）。
          reportedDone: !!sub.reportedDone, completed: !!sub.completed,
          activeThisWeek: true, weekOf: sub.weekOf,
          submittedAt: firstAt(sub.logs), decidedAt: sub.reviewedAt, rejectNote: sub.note,
          reviewerName: user?.name ?? null, accountableName: proj.accountableName ?? null,
          attachments: attOf(sub.logs), logCount: sub.logs.length,
        })
        map.set(k, f)
      }
    }

    // 棒次列的數字必須跟點進去的清單筆數一致，所以用同一套去重規則算：
    //   同一個任務在 map 裡可能同時有 track: 與 pid:author:task:week 兩種鍵
    //   （追蹤一份、每個填報週各一份），逐筆累加會比清單多。
    //   以 taskId 去重、優先採用 track:（狀態最完整），與清單的取法一字不差。
    const dedup = new Map<string, ReviewFlow>()
    for (const [k, f] of map) {
      const prev = dedup.get(f.taskId)
      if (!prev || k.startsWith('track:')) dedup.set(f.taskId, f)
    }
    for (const f of dedup.values()) counts[f.stage]++

    return { map, counts, logs, actionable }
  }, [reviewDialogProject, reviewTrackWeek, user])

  const supSelectedFlow = supFlowKey ? supFlows.map.get(supFlowKey) ?? null : null
  // 「全部」＝工作紀錄跨鏈列出整個任務；流程仍畫目前這條（流程本來就只能畫一條）
  const [supChainAll, setSupChainAll] = useState(true)
  useEffect(() => { setSupChainAll(true) }, [supSelectedFlow?.taskId])
  const supSelectedLogs = useMemo(() => {
    if (!supFlowKey) return [] as ReviewLogItem[]
    if (!supChainAll) return supFlows.logs.get(supFlowKey) ?? []
    const taskId = supFlows.map.get(supFlowKey)?.taskId
    if (!taskId) return supFlows.logs.get(supFlowKey) ?? []
    const bag = new Map<string, ReviewLogItem>()
    for (const [k, ls] of supFlows.logs) {
      if (supFlows.map.get(k)?.taskId !== taskId) continue
      for (const l of ls) bag.set(l.id, l)
    }
    return [...bag.values()].sort((a, b) => a.logDate.localeCompare(b.logDate))
  }, [supFlowKey, supChainAll, supFlows])
  // 可操作的待審項目。棒次視角選到的可能是 track: 鍵（去重時優先保留它，狀態較完整），
  // 那把鑰匙不在 actionable 裡 → 直接查會找不到，按鈕就消失。改成再用 taskId 回頭找一次。
  const supSelectedAction = useMemo(() => {
    if (!supFlowKey) return null
    const direct = supFlows.actionable.get(supFlowKey)
    if (direct) return direct
    // track: 是任務層級的檢視鍵，本身不對應任何一批送審 → 退回找該任務待處理的那一批。
    //   但明確選定某一條鏈時不能退回：那條已審完卻顯示別批的「通過／駁回」，
    //   按下去會核准到使用者根本沒在看的那一批（實際踩過）。
    if (!supFlowKey.startsWith('track:')) return null
    const f = supFlows.map.get(supFlowKey)
    if (!f) return null
    for (const a of supFlows.actionable.values()) {
      if (a.sub.taskId === f.taskId) return a
    }
    return null
  }, [supFlowKey, supFlows])
  const doReviewAction = async (projectId: string, authorId: string, s: ReviewSubmission, action: 'approve' | 'reject', note?: string) => {
    if (!user?.email) return
    setReviewBusy(subKey(projectId, authorId, s))
    try {
      const res = await fetch('/api/report-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 這裡是主管的對話框 → 一律以主管身分；批次要帶，否則會動到同一週的其他批補充
        body: JSON.stringify({ reviewerEmail: user.email, projectId, taskId: s.taskId, authorId, weekOf: s.weekOf, batch: s.batch ?? null, supplement: !!s.supplement, as: 'reviewer', action, note }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || '操作失敗'); return }
      const d = await res.json().catch(() => ({}))
      if (d.noop) {
        // 此報告已被審過（重複點擊）→ 不再記一筆歷程，僅提示並重新整理讓過時項目消失
        toast.info('此報告已審核過，已為你重新整理')
      } else {
        toast.success(action === 'approve' ? '已核准，報告進入更新紀錄' : '已駁回，退回成員')
      }
      await refetchReviewInbox()
      await refreshMyTasks() // 同步 A 端「成員週報」狀態（核准後應顯示已進紀錄，不再是主管審核中）
    } catch { toast.error('操作失敗') }
    finally { setReviewBusy(null) }
  }
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [dialogTask, setDialogTask] = useState<{ task: Task; project: MyTasksProject } | null>(null)
  const [logContent, setLogContent] = useState('')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0])
  const [showExtensionForm, setShowExtensionForm] = useState(false)
  const [extensionReason, setExtensionReason] = useState('')
  const [extensionDate, setExtensionDate] = useState('')
  const [extensionSupport, setExtensionSupport] = useState('')
  const [showActions, setShowActions] = useState(false)
  const [logContentInterim, setLogContentInterim] = useState('')
  const [attachments, setAttachments] = useState<TaskLogAttachment[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [editLogContent, setEditLogContent] = useState('')
  const [editLogDate, setEditLogDate] = useState('')
  const [editLogAttachments, setEditLogAttachments] = useState<TaskLogAttachment[]>([])
  const [editUploadingFiles, setEditUploadingFiles] = useState(false)
  const [editUploadProgress, setEditUploadProgress] = useState(0)
  const [editLogContentInterim, setEditLogContentInterim] = useState('')
  const [deletingLog, setDeletingLog] = useState<TaskLog | null>(null)
  const [msDateDialogOpen, setMsDateDialogOpen] = useState(false)
  const [msDateDialogData, setMsDateDialogData] = useState<{
    milestoneId: string
    milestoneName: string
    projectId: string
    projectName: string
    currentStartDate: string
    currentDueDate: string
    nextMilestoneDueDate: string | null
    nextMilestoneName: string | null
    proposedDate: string
  } | null>(null)
  // Inline subtask creation on card
  const [addingSubtaskForId, setAddingSubtaskForId] = useState<string | null>(null)
  const [inlineSubtaskTitle, setInlineSubtaskTitle] = useState('')
  const [inlineSubtaskDays, setInlineSubtaskDays] = useState(1)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [collapsedMilestones, setCollapsedMilestones] = useState<Set<string>>(new Set())
  // PM project edit dialog
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editProjectLoading, setEditProjectLoading] = useState<string | null>(null)
  const [importSubLogsOpen, setImportSubLogsOpen] = useState(false)
  const [importSubLogsLoading, setImportSubLogsLoading] = useState(false)
  // Role-based tab state
  const [activeRole, setActiveRole] = useState<string>('')
  const [weeklyReportForms, setWeeklyReportForms] = useState<Record<string, { content: string; blockers: string; nextPlan: string }>>({})
  const [weeklyReportSubmitting, setWeeklyReportSubmitting] = useState<string | null>(null)
  const [existingReports, setExistingReports] = useState<Record<string, { id: string; content: string; blockers: string; nextPlan: string; updatedAt: string }>>({})
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false)
  // P-tab: procurement data
  const [procurementData, setProcurementData] = useState<Record<string, { budgetItems: any[]; capexItems: any[]; loading: boolean }>>({})
  // R-tab: weekly report dialog (task-based, matching Gantt chart design)
  const [rReportDialogOpen, setRReportDialogOpen] = useState(false)
  const [rReportDialogProject, setRReportDialogProject] = useState<MyTasksProject | null>(null)
  const [rReportWeekOf, setRReportWeekOf] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  })
  const [rSelectedTaskId, setRSelectedTaskId] = useState<string | null>(null)
  interface RLogRow {
    date: string; content: string; existingLogId?: string; attachments?: TaskLogAttachment[]
    updatedAt?: string; lastEditedBy?: string | null
    /** 這一列先前被駁回、尚未重送——R 跳回來修正時要一眼看到是哪一列、為什麼 */
    rejectedAt?: string | null
    rejectedBy?: string | null
    rejectNote?: string | null
  }
  const [rLogRows, setRLogRows] = useState<RLogRow[]>([{ date: '', content: '' }])
  const [rLogNextWeekPlan, setRLogNextWeekPlan] = useState('')
  const [rSubmittingBatch, setRSubmittingBatch] = useState(false)
  const [rTogglingDone, setRTogglingDone] = useState<string | null>(null)
  const [rDialogTab, setRDialogTab] = useState<'active' | 'pending' | 'fix' | 'done' | 'history'>('active')
  // ── 完成後補充：執行者對「已完成」任務補交資料 ──
  //   照走 R主管審核、核准即進更新紀錄，但不動任務的完成日與進度（客戶需求 2026-08-29）。
  const [rSupTask, setRSupTask] = useState<{ id: string; title: string; projectId: string; completedAt: string | null } | null>(null)
  const [rSupRows, setRSupRows] = useState<{ date: string; content: string; attachments?: TaskLogAttachment[] }[]>([{ date: '', content: '' }])
  const [rSupSaving, setRSupSaving] = useState(false)
  const [rSupUploadingIdx, setRSupUploadingIdx] = useState<number | null>(null)
  const rSupFileRef = useRef<HTMLInputElement>(null)
  const rSupTargetIdx = useRef<number | null>(null)
  // 展開任務內的子分頁：write＝撰寫報告(預設)；children＝查看子層報告(僅當選到的任務有子任務時才出現)
  const [rExpandSubTab, setRExpandSubTab] = useState<'write' | 'children'>('write')
  const [rChildViewTaskId, setRChildViewTaskId] = useState<string | null>(null)
  const [rChildPickerOpen, setRChildPickerOpen] = useState(false)
  // 回報完成前的確認視窗（按下後 R 不能再編輯此任務週報）
  const [rConfirmDone, setRConfirmDone] = useState<Task | null>(null)
  // 重送「已通過」報告前的確認視窗（避免誤操作，讓主管/A 覺得奇怪）
  const [rResubmitConfirm, setRResubmitConfirm] = useState(false)
  // 取消回報前的確認視窗（A 正在確認中，避免任務跳來跳去讓 A 困惑）
  const [rConfirmCancel, setRConfirmCancel] = useState<Task | null>(null)
  // 週報有填但尚未提交 → 關閉前提醒（避免使用者關掉後資料消失又怪系統）
  const [rDirty, setRDirty] = useState(false)
  const [rConfirmClose, setRConfirmClose] = useState(false)
  // ── 審核中心（當責 A）──
  const [reviewCenterOpen, setReviewCenterOpen] = useState(false)
  const [reviewTab, setReviewTab] = useState<'pending' | 'members' | 'history'>('pending')
  const [reviewProcessing, setReviewProcessing] = useState<string | null>(null)
  const [reviewRejectItem, setReviewRejectItem] = useState<{ projectId: string; taskId: string; title: string } | null>(null)
  const [reviewRejectReason, setReviewRejectReason] = useState('')
  const [reviewProjectId, setReviewProjectId] = useState<string | null>(null)
  const [reviewHistoryPage, setReviewHistoryPage] = useState(0)
  const [reviewReportWeek, setReviewReportWeek] = useState(() => {
    const now = new Date(); const day = now.getDay(); const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now); monday.setDate(diff)
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  })
  const [reviewMemberExpanded, setReviewMemberExpanded] = useState<Set<string>>(new Set())
  const [reviewMemberView, setReviewMemberView] = useState<'member' | 'task'>('member')
  // ── 流程面板：右側顯示所選任務的完整審核鏈；管線列可依「卡在哪一棒」篩選 ──
  const [reviewFlowTaskId, setReviewFlowTaskId] = useState<string | null>(null)
  const [reviewStageFilter, setReviewStageFilter] = useState<FlowStage | null>(null)
  // 右欄：分頁（審核流程／工作紀錄）與收合狀態，A／主管兩個對話框共用同一組偏好
  const [flowTab, setFlowTab] = useState<FlowPanelTab>('flow')
  const [flowPanelOpen, setFlowPanelOpen] = useState(true)
  // R 的填報彈窗主要用途是「寫報告」，右欄預設收起，想看流程才拉開
  const [rFlowPanelOpen, setRFlowPanelOpen] = useState(false)
  const [rFlowTab, setRFlowTab] = useState<FlowPanelTab>('flow')
  // A 代審報告（該成員未設主管）：處理中的 taskId、以及駁回原因對話框
  const [aReportBusy, setAReportBusy] = useState<string | null>(null)
  const [aReportReject, setAReportReject] = useState<{ taskId: string; title: string } | null>(null)
  const [aReportRejectReason, setAReportRejectReason] = useState('')
  // 撤回：kind 決定撤哪一棒（當責撤回完成確認 / 主管撤回報告核准）
  const [revokeTarget, setRevokeTarget] = useState<
    { kind: 'confirm'; projectId: string; taskId: string; title: string }
    | { kind: 'approval'; projectId: string; authorId: string; taskId: string; title: string; weekOf: string | null
        /** 撤的是哪一條鏈：完成後補充 / 一般週報。同一任務可能多條並存 */
        supplement?: boolean
        /** 補充的批次；同一週可能多批，撤回只能動到指定那一批 */
        batch?: string | null
        /** 由哪個對話框發起：主管撤自己的核准 / 當責撤自己的通過 */
        as?: 'reviewer' | 'accountable'
        /** 鏈的顯示名稱（例：補充 · 8/29 送出），對話框要講清楚撤的是哪一批 */
        chainLabel?: string }
    | null
  >(null)
  const [revokeReason, setRevokeReason] = useState('')
  // 右欄要看哪一條審核鏈；null＝自動（優先顯示還在途的那條）。
  //   一個任務可能有多條：本週報告一條，加上每一批完成後補充各一條
  //   （8/29 補 8/27+8/30、9/4 又補 9/2+9/5 → 兩批，各自獨立送審與撤回）。
  const [flowChainKey, setFlowChainKey] = useState<string | null>(null)
  // R 端同一份篩選（他自己也可能有正式報告＋多批補充）
  const [rFlowChainKey, setRFlowChainKey] = useState<string | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)
  // 週報彈窗內的錯誤提示（改用彈跳視窗，不用 window.alert）
  const [rErrorMsg, setRErrorMsg] = useState<string | null>(null)
  // 過去週報預設唯讀，需按「編輯」才解鎖（避免誤改過去報告）
  const [rEditPastUnlocked, setREditPastUnlocked] = useState(false)
  // 完成區展開查看紀錄的任務
  const [rDoneExpanded, setRDoneExpanded] = useState<Set<string>>(new Set())
  const [rUploadingRowIdx, setRUploadingRowIdx] = useState<number | null>(null)
  const [rUploadProgress, setRUploadProgress] = useState<number>(0) // 0~100；0 或負值顯示為不確定進度
  const rRowFileInputRef = useRef<HTMLInputElement>(null)
  const rRowTargetIdx = useRef<number | null>(null) // 開啟檔案選擇器的目標列；取消選檔時不會觸發 onChange，故不能用它顯示 spinner
  // A-tab: R member report dialog
  const [aRReportDialogOpen, setARReportDialogOpen] = useState(false)
  const [aRReportProject, setARReportProject] = useState<MyTasksProject | null>(null)
  const [aRReportData, setARReportData] = useState<{ reports: any[]; memberStatus: any[] }>({ reports: [], memberStatus: [] })
  const [aRReportLoading, setARReportLoading] = useState(false)
  const [aRReportWeekOf, setARReportWeekOf] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  })
  const [aRReportFilterUser, setARReportFilterUser] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const editImageInputRef = useRef<HTMLInputElement>(null)

  // Fetch tasks from API
  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        const projects = data.projects ?? []
        setApiProjects(projects)
        // Default: all milestones collapsed
        const allMsIds = new Set<string>()
        for (const p of projects) {
          for (const m of p.milestones) allMsIds.add(m.id)
        }
        setCollapsedMilestones(allMsIds)
      })
      .catch(() => setApiProjects([]))
      .finally(() => setLoading(false))
  }, [user])

  // Compute user roles across all projects
  const ROLE_TAB_CONFIG: Record<string, { label: string; icon: string; desc: string }> = {
    MY: { label: '我的任務週報', icon: 'file', desc: '填寫被指派任務的工作週報（不分角色）' },
    A: { label: '當責', icon: 'clipboard', desc: '填寫週報、管理任務' },
    R: { label: '執行', icon: 'wrench', desc: '填寫工作週報' },
    P: { label: '採購', icon: 'shopping-cart', desc: '管理採購資訊' },
    C: { label: '諮詢', icon: 'message', desc: '查看專案進度' },
    I: { label: '知會', icon: 'bell', desc: '查看專案進度' },
    S: { label: '審核', icon: 'shield', desc: '審核延期申請' },
    REVIEW: { label: '審查報告', icon: 'clipboard-check', desc: '審核你負責督導的成員送出的報告' },
  }

  const userRolesMap = useMemo(() => {
    const map = new Map<string, MyTasksProject[]>()
    for (const p of apiProjects) {
      if (!p.userRole) continue
      const role = p.userRole
      if (!map.has(role)) map.set(role, [])
      map.get(role)!.push(p)
    }
    return map
  }, [apiProjects])

  // 「我的任務週報」：所有「有指派任務給我」的專案（不分 RACI 角色）
  const myReportProjects = useMemo(
    () => apiProjects.filter(p => !!user && p.tasks.some(t => isSameUser(t.assignee, user))),
    [apiProjects, user],
  )

  const reviewPendingCount = useMemo(
    () => reviewInbox.reduce((n, p) => n + p.reviewees.reduce((m, rv) => m + rv.pending.length, 0), 0),
    [reviewInbox],
  )

  const availableRoles = useMemo(() => {
    // R 改由「我的任務週報(MY)」涵蓋，所以角色頁籤不再列 R
    const order = ['S', 'A', 'P', 'C', 'I']
    const roleTabs = order.filter(r => userRolesMap.has(r))
    const tabs: string[] = []
    if (myReportProjects.length > 0) tabs.push('MY')
    // 我是任何人的報告審核主管 → 常駐「審查報告」，緊接在「我的任務週報」右邊
    if (isReviewer) tabs.push('REVIEW')
    tabs.push(...roleTabs)
    return tabs
  }, [userRolesMap, myReportProjects, isReviewer])

  // 通知深連結：/my-tasks?role=REVIEW|MY|A|… → 開在對應頁籤（僅消化一次，之後可自由切換）
  const [roleFromUrl, setRoleFromUrl] = useState<string | null>(null)
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('role')
    if (r) setRoleFromUrl(r)
  }, [])

  // Auto-set initial active role
  useEffect(() => {
    if (availableRoles.length === 0) return
    if (roleFromUrl && availableRoles.includes(roleFromUrl)) {
      setActiveRole(roleFromUrl)
      setRoleFromUrl(null) // 消化一次，避免手動切頁籤時被拉回
      return
    }
    if (!availableRoles.includes(activeRole)) {
      setActiveRole(availableRoles[0])
    }
  }, [availableRoles, activeRole, roleFromUrl])

  const roleProjects = useMemo(() => userRolesMap.get(activeRole) || [], [userRolesMap, activeRole])

  // Fetch existing weekly reports for projects where I have assigned tasks
  useEffect(() => {
    if (!user || myReportProjects.length === 0) return
    setWeeklyReportLoading(true)
    const fetchReports = async () => {
      const reports: Record<string, { id: string; content: string; blockers: string; nextPlan: string; updatedAt: string }> = {}
      for (const p of myReportProjects) {
        try {
          const res = await fetch(`/api/member-weekly-reports?projectId=${p.id}&userId=${user.id}`)
          if (res.ok) {
            const data = await res.json()
            for (const r of data.reports) {
              const key = `${p.id}_${r.milestoneId}`
              reports[key] = { id: r.id, content: r.content, blockers: r.blockers, nextPlan: r.nextPlan, updatedAt: r.updatedAt }
            }
          }
        } catch { /* ignore */ }
      }
      setExistingReports(reports)
      setWeeklyReportLoading(false)
    }
    fetchReports()
  }, [user, myReportProjects])

  // Fetch procurement data for P-role projects
  const pProjects = useMemo(() => apiProjects.filter(p => p.userRole === 'P'), [apiProjects])
  useEffect(() => {
    if (!user || pProjects.length === 0) return
    for (const p of pProjects) {
      if (procurementData[p.id]) continue
      setProcurementData(prev => ({ ...prev, [p.id]: { budgetItems: [], capexItems: [], loading: true } }))
      Promise.all([
        fetch(`/api/projects/${p.id}/budget-items`).then(r => r.ok ? r.json() : []),
        fetch(`/api/projects/${p.id}/capex`).then(r => r.ok ? r.json() : []),
      ]).then(([budgetItems, capexItems]) => {
        setProcurementData(prev => ({ ...prev, [p.id]: { budgetItems, capexItems, loading: false } }))
      }).catch(() => {
        setProcurementData(prev => ({ ...prev, [p.id]: { budgetItems: [], capexItems: [], loading: false } }))
      })
    }
  }, [user, pProjects])

  // Build grouped data: project → milestone groups → tasks (filtered by active role)
  const projectGroups = useMemo(() => {
    if (!user) return []
    const result: { project: MyTasksProject; milestoneGroups: MilestoneTaskGroup[]; completedCount: number; totalCount: number; isPM: boolean }[] = []

    const roleFilteredProjects = activeRole
      ? apiProjects.filter(p => p.userRole === activeRole)
      : apiProjects

    roleFilteredProjects.forEach(p => {
      const isPM = p.userRole === 'A'
      // 成員只看「指派給自己」的任務——含子任務（修正:之前 !t.parentId 只抓頂層，
      // 導致別人父任務底下、指派給我的子任務看不到）。以「最高指派層級」呈現避免重複巢狀。
      const assignedToMe = (t: Task) => isSameUser(t.assignee, user)
      const ancestorAssignedToMe = (t: Task) => {
        let cur = t.parentId ? p.tasks.find(x => x.id === t.parentId) : undefined
        const seen = new Set<string>()
        while (cur && !seen.has(cur.id)) { seen.add(cur.id); if (assignedToMe(cur)) return true; cur = cur.parentId ? p.tasks.find(x => x.id === cur!.parentId) : undefined }
        return false
      }
      const visibleTasks = isPM
        ? p.tasks.filter(t => !t.parentId)
        : p.tasks.filter(t => assignedToMe(t) && !ancestorAssignedToMe(t))
      if (visibleTasks.length === 0 && !isPM) return
      // PM can see projects with milestones even if no tasks yet
      if (visibleTasks.length === 0 && isPM && p.milestones.length === 0) return

      const milestoneMap = new Map<string, Task[]>()
      visibleTasks.forEach(t => {
        const arr = milestoneMap.get(t.milestoneId) || []
        arr.push(t)
        milestoneMap.set(t.milestoneId, arr)
      })

      // For PM, include milestones even if they have no tasks
      const milestoneGroups: MilestoneTaskGroup[] = []
      if (isPM) {
        p.milestones.forEach(m => {
          milestoneGroups.push({
            milestoneId: m.id,
            milestoneName: m.name,
            milestoneDueDate: m.dueDate,
            tasks: milestoneMap.get(m.id) || [],
          })
        })
      } else {
        milestoneMap.forEach((tasks, milestoneId) => {
          const milestone = p.milestones.find(m => m.id === milestoneId)
          if (!milestone) return
          milestoneGroups.push({
            milestoneId,
            milestoneName: milestone.name,
            milestoneDueDate: milestone.dueDate,
            tasks,
          })
        })
      }

      milestoneGroups.sort((a, b) => new Date(a.milestoneDueDate).getTime() - new Date(b.milestoneDueDate).getTime())

      const completedCount = visibleTasks.filter(t => !!t.completedAt).length
      result.push({ project: p, milestoneGroups, completedCount, totalCount: visibleTasks.length, isPM })
    })

    return result
  }, [apiProjects, user, activeRole])

  const userProjects = projectGroups.map(g => g.project)

  const filteredGroups = selectedProjectId === 'all'
    ? projectGroups
    : projectGroups.filter(g => g.project.id === selectedProjectId)

  // Stats
  const allTasks = projectGroups.flatMap(g => g.milestoneGroups.flatMap(m => m.tasks))
  const totalTasks = allTasks.length
  const completedCount = allTasks.filter(t => !!t.completedAt).length
  const atRiskCount = projectGroups.flatMap(g =>
    g.milestoneGroups.flatMap(m =>
      m.tasks.filter(t => {
        const s = computeTaskStatus(t, g.project.taskLogs)
        return s === 'at-risk' || s === 'overdue' || s === 'overdue-not-started'
      })
    )
  ).length
  const onTrackCount = totalTasks - completedCount - atRiskCount

  const toggleProject = (projectId: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const allProjectsCollapsed = filteredGroups.length > 0 && filteredGroups.every(g => collapsedProjects.has(g.project.id))
  const toggleAllProjects = () => {
    if (allProjectsCollapsed) {
      setCollapsedProjects(new Set())
    } else {
      setCollapsedProjects(new Set(filteredGroups.map(g => g.project.id)))
    }
  }

  const openTaskDialog = (task: Task, project: MyTasksProject) => {
    setDialogTask({ task, project })
    setLogContent('')
    setLogDate(new Date().toISOString().split('T')[0])
    setShowExtensionForm(false)
    setExtensionReason('')
    setExtensionDate('')
    setExtensionSupport('')
    setShowActions(false)
    setAttachments([])
    setLogContentInterim('')
    setUploadingFiles(false)
    setEditingLogId(null)
    setDialogOpen(true)
  }

  // ── File/image select ──
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    // Copy to array BEFORE clearing input (clearing value may empty the FileList reference)
    const fileArray = Array.from(files)
    e.target.value = ''
    setUploadingFiles(true)
    setUploadProgress(0)
    try {
      const uploaded: TaskLogAttachment[] = []
      let completed = 0
      for (const file of fileArray) {
        const att = await uploadFile(file, p => {
          const cur = p < 0 ? 0 : p
          setUploadProgress(Math.round(((completed + cur / 100) / fileArray.length) * 100))
        })
        uploaded.push(att)
        completed++
      }
      if (uploaded.length > 0) setAttachments(prev => [...prev, ...uploaded])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上傳失敗，請確認網路連線')
    } finally {
      setUploadingFiles(false)
      setUploadProgress(0)
    }
  }, [])

  // ── PM: Submit milestone date change as a delay request ──
  const handleMilestoneDateChange = async () => {
    if (!msDateDialogData || !user) return
    const { milestoneId, milestoneName, projectId, currentDueDate, proposedDate } = msDateDialogData
    if (proposedDate === currentDueDate) {
      setMsDateDialogOpen(false)
      setMsDateDialogData(null)
      return
    }

    try {
      const res = await fetch('/api/delay-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          requesterId: user.id,
          type: 'date_change',
          reason: `PM 調整里程碑「${milestoneName}」預定日期：${currentDueDate} → ${proposedDate}`,
          canCatchUp: true,
          affectedMilestones: [{
            milestoneId,
            originalDate: currentDueDate,
            proposedDate,
          }],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送出失敗')
      }
      // Optimistic update
      setApiProjects(prev => prev.map(p =>
        p.id === projectId
          ? {
              ...p,
              pendingDelayMilestoneIds: [...(p.pendingDelayMilestoneIds || []), milestoneId],
              pendingDelayProposedDates: { ...(p.pendingDelayProposedDates || {}), [milestoneId]: proposedDate },
            }
          : p
      ))
    } catch (err) {
      alert(err instanceof Error ? err.message : '送出延期申請失敗')
    }
    setMsDateDialogOpen(false)
    setMsDateDialogData(null)
  }

  // ── PM: Open project edit dialog ──
  const handleOpenProjectEdit = async (projectId: string) => {
    setEditProjectLoading(projectId)
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (!res.ok) throw new Error('載入專案失敗')
      const proj: Project = await res.json()
      setEditProject(proj)
      setEditProjectOpen(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : '載入專案失敗')
    } finally {
      setEditProjectLoading(null)
    }
  }

  const handleEditProjectSave = async (data: ProjectEditData) => {
    if (!editProject) return
    const res = await fetch(`/api/projects/${editProject.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('儲存失敗')
  }

  // ── Add subtask inline on card ──
  const handleAddSubtaskInline = async (parentTask: Task, project: MyTasksProject) => {
    if (!inlineSubtaskTitle.trim() || !user) return

    try {
      const res = await fetch(`/api/projects/${project.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestoneId: parentTask.milestoneId,
          parentId: parentTask.id,
          title: inlineSubtaskTitle.trim(),
          assignee: user.name,
          priority: 'medium',
          startDate: parentTask.startDate,
          endDate: parentTask.endDate,
          durationDays: inlineSubtaskDays,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '新增子任務失敗')
      }
      const newSubtask = await res.json()
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              tasks: p.tasks.map(t =>
                t.id === parentTask.id
                  ? { ...t, subtasks: [...(t.subtasks || []), { ...newSubtask, status: newSubtask.status === 'in_progress' ? 'in-progress' : newSubtask.status }] }
                  : t
              ),
            }
          : p
      ))
      setInlineSubtaskTitle('')
      setInlineSubtaskDays(1)
      setAddingSubtaskForId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : '新增子任務失敗')
    }
  }

  // ── Delete subtask inline on card ──
  const handleDeleteSubtask = async (subtaskId: string, parentTask: Task, project: MyTasksProject) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${subtaskId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('刪除失敗')
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              tasks: p.tasks.map(t =>
                t.id === parentTask.id
                  ? { ...t, subtasks: (t.subtasks || []).filter(s => s.id !== subtaskId) }
                  : t
              ),
            }
          : p
      ))
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除子任務失敗')
    }
  }

  /** Gather subtask log content for the current dialog task on the selected logDate */
  const getSubtaskLogsContent = useCallback(() => {
    if (!dialogTask) return null
    const task = dialogTask.task
    const project = dialogTask.project
    const subtasks = task.subtasks || []
    if (subtasks.length === 0) return null

    const entries: { title: string; progress: number; content: string }[] = []
    for (const sub of subtasks) {
      // Find the most recent log for this subtask on or before logDate
      const subLogs = project.taskLogs
        .filter(l => l.taskId === sub.id)
        .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())
      const latestLog = subLogs.find(l => l.logDate <= logDate) || subLogs[0]
      if (latestLog) {
        entries.push({ title: sub.title, progress: sub.progress, content: latestLog.content })
      }
    }
    return entries.length > 0 ? entries : null
  }, [dialogTask, logDate])

  const handleImportSubLogsRaw = () => {
    const entries = getSubtaskLogsContent()
    if (!entries) return
    const text = entries.map(e => `【${e.title}】(${e.progress}%)\n${e.content}`).join('\n\n')
    setLogContent(prev => prev ? `${prev}\n\n${text}` : text)
    setImportSubLogsOpen(false)
  }

  const handleImportSubLogsAI = async () => {
    const entries = getSubtaskLogsContent()
    if (!entries) return
    setImportSubLogsLoading(true)
    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: entries.map(e => ({ title: e.title, progress: e.progress, content: e.content })),
          taskTitle: dialogTask?.task.title || '',
        }),
      })
      if (!res.ok) throw new Error()
      const { summary } = await res.json()
      setLogContent(prev => prev ? `${prev}\n\n${summary}` : summary)
    } catch {
      // Fallback to raw if AI fails
      handleImportSubLogsRaw()
    }
    setImportSubLogsLoading(false)
    setImportSubLogsOpen(false)
  }

  // ── Weekly report submit handler ──
  const handleSubmitWeeklyReport = async (projectId: string, milestoneId: string) => {
    if (!user) return
    const key = `${projectId}_${milestoneId}`
    const form = weeklyReportForms[key]
    if (!form?.content?.trim()) return

    setWeeklyReportSubmitting(key)
    try {
      const res = await fetch('/api/member-weekly-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          milestoneId,
          userId: user.id,
          content: form.content.trim(),
          blockers: form.blockers?.trim() || '',
          nextPlan: form.nextPlan?.trim() || '',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送出失敗')
      }
      const report = await res.json()
      setExistingReports(prev => ({
        ...prev,
        [key]: { id: report.id, content: form.content.trim(), blockers: form.blockers?.trim() || '', nextPlan: form.nextPlan?.trim() || '', updatedAt: report.updatedAt },
      }))
      // Clear form
      setWeeklyReportForms(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : '送出週報失敗')
    } finally {
      setWeeklyReportSubmitting(null)
    }
  }

  const handleEditWeeklyReport = (projectId: string, milestoneId: string) => {
    const key = `${projectId}_${milestoneId}`
    const existing = existingReports[key]
    if (existing) {
      setWeeklyReportForms(prev => ({
        ...prev,
        [key]: { content: existing.content, blockers: existing.blockers, nextPlan: existing.nextPlan },
      }))
    }
  }

  // Open R report dialog
  const openRReportDialog = (project: MyTasksProject) => {
    setRReportDialogProject(project)
    setRSelectedTaskId(null)
    setRLogRows([{ date: '', content: '' }])
    setRLogNextWeekPlan('')
    setRDialogTab('active')
    setRDirty(false)
    setRReportDialogOpen(true)
  }

  // 實際關閉週報彈窗（清狀態）— 由 onOpenChange 或關閉確認視窗呼叫
  const closeRReportDialog = () => {
    setRReportDialogOpen(false)
    setRReportDialogProject(null)
    setRSelectedTaskId(null)
    setRDirty(false)
    setRConfirmClose(false)
  }

  // Get user's assigned tasks for R dialog, grouped by their FULL path.
  // ADR-02: drill through the whole task tree (1~6 層) — a task assigned to me at
  // ANY depth must appear. The group header carries the full breadcrumb
  // 里程碑 › 父任務 › …，so每列只需顯示最底層任務名，用戶就知道它在哪一層底下。
  //  待完成(active)：未完成、未回報，且任務已在本週(含之前)開始 → 可填寫。
  //  A 確認中(pending)：R 已回報、A 尚未確認 → 讓 R 知道不是按下就完成。
  //  完成區(done)：A 已標記完成(completedAt) → 存查紀錄。
  const { rActiveGroups, rPendingGroups, rDoneGroups } = useMemo(() => {
    const empty = { rActiveGroups: [] as RTaskGroup[], rPendingGroups: [] as RTaskGroup[], rDoneGroups: [] as RTaskGroup[] }
    if (!rReportDialogProject || !user) return empty
    const allTasks = rReportDialogProject.tasks
    const byId = new Map(allTasks.map(t => [t.id, t]))
    const childrenOf = new Map<string, Task[]>()
    for (const t of allTasks) {
      if (t.parentId) {
        const arr = childrenOf.get(t.parentId)
        if (arr) arr.push(t)
        else childrenOf.set(t.parentId, [t])
      }
    }
    const ancestorsOf = (t: Task): string[] => {
      const chain: string[] = []
      let cur = t.parentId ? byId.get(t.parentId) : undefined
      while (cur) { chain.unshift(cur.title); cur = cur.parentId ? byId.get(cur.parentId) : undefined }
      return chain
    }
    const build = (taskFilter: (t: Task) => boolean, includeDoneMs: boolean): RTaskGroup[] => {
      const groups: RTaskGroup[] = []
      const groupIndex = new Map<string, number>()
      for (const ms of rReportDialogProject.milestones) {
        if (!includeDoneMs && ms.status === 'done') continue
        const walk = (t: Task) => {
          if (isSameUser(t.assignee, user) && taskFilter(t)) {
            const pathLabel = [ms.name, ...ancestorsOf(t)].join(' › ')
            const key = `${ms.id}::${pathLabel}`
            let idx = groupIndex.get(key)
            if (idx === undefined) {
              idx = groups.length
              groupIndex.set(key, idx)
              groups.push({ key, pathLabel, dueDate: ms.dueDate, tasks: [] })
            }
            groups[idx].tasks.push(t)
          }
          for (const c of childrenOf.get(t.id) || []) walk(c)
        }
        for (const top of allTasks.filter(t => t.milestoneId === ms.id && !t.parentId)) walk(top)
      }
      return groups
    }
    // 本週結束日（週日）字串，用來判斷任務是否在該週(含之前)已被指派
    const [wy, wm, wd] = rReportWeekOf.split('-').map(Number)
    const wEnd = new Date(wy, wm - 1, wd + 6)
    const weekEnd = `${wEnd.getFullYear()}-${String(wEnd.getMonth() + 1).padStart(2, '0')}-${String(wEnd.getDate()).padStart(2, '0')}`
    // 這個任務有沒有「我送出、但還沒進更新紀錄」的報告（審核中或被駁回都算在途）
    const logsByTask = new Map<string, TaskLog[]>()
    for (const l of rReportDialogProject.taskLogs) {
      const arr = logsByTask.get(l.taskId)
      if (arr) arr.push(l); else logsByTask.set(l.taskId, [l])
    }
    const hasInFlightReport = (t: Task) =>
      (logsByTask.get(t.id) ?? []).some(l => isSameUser(l.author, user) && !isReportVisible(l) && !l.reviewerRejectedAt)
    const hasRejectedReport = (t: Task) =>
      (logsByTask.get(t.id) ?? []).some(l => isSameUser(l.author, user) && !!l.reviewerRejectedAt && !l.publishedAt)

    return {
      // 待完成：純寫報告的地方。R 從「被指派那刻」起才看到 → 指派日 <= 該週結束日。
      // assignedAt 若缺（舊資料）則照舊顯示，不誤藏。
      //   報告被駁回時即使 reportedDoneAt 還在，也要回到這裡——球已退回 R，他必須能重寫報告；
      //   留在「待確認」等於看得到卻寫不了。
      rActiveGroups: build(t => !t.completedAt
        && (!t.reportedDoneAt || hasRejectedReport(t))
        && (!t.assignedAt || t.assignedAt <= weekEnd), false),
      // 待確認：我送出去、還在「別人手上」的東西。被駁回的不算——那已經退回我這裡了。
      //   ① 報告已送出、尚未進更新紀錄（審核中）
      //   ② 已回報任務完成、等當責確認
      rPendingGroups: build(t => !t.completedAt && !t.reviewedAt && !hasRejectedReport(t) && (
        !!t.reportedDoneAt || hasInFlightReport(t)
      ), true),
      // 完成區：A 已審核通過 或 A 已標記 100% 完成
      rDoneGroups: build(t => !!t.completedAt || !!t.reviewedAt, true),
    }
  }, [rReportDialogProject, user, rReportWeekOf])

  const rPendingCount = useMemo(() => rPendingGroups.reduce((n, g) => n + g.tasks.length, 0), [rPendingGroups])
  const rDoneCount = useMemo(() => rDoneGroups.reduce((n, g) => n + g.tasks.length, 0), [rDoneGroups])

  // 同一天重複的日期（同日同作者後端只算一筆 → 開兩列會打架，需防呆）
  const rDuplicateDates = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rLogRows) { if (r.date) counts.set(r.date, (counts.get(r.date) || 0) + 1) }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([d]) => d))
  }, [rLogRows])

  // 待修正：我被駁回、尚未重送的報告（跨週）。
  //   被駁回的報告散在各週，R 沒有集中入口就記不得是哪一週被退的，
  //   實務上多半改在最新週另寫一筆 → 舊那筆永遠停在駁回、該週更新紀錄留白。
  const rFixItems = useMemo(() => {
    if (!rReportDialogProject || !user) return []
    const byId = new Map(rReportDialogProject.tasks.map(t => [t.id, t]))
    return rReportDialogProject.taskLogs
      // 只追 8/26 之後的駁回：更早的資料產生時還沒有這套追蹤與提醒，
      // 現在才要求 R 回頭補不合理，清單也會永遠清不掉。（客戶決策 2026-08-27）
      .filter(l => isSameUser(l.author, user) && !l.publishedAt && isRejectionTracked(l.reviewerRejectedAt))
      .map(l => {
        const t = byId.get(l.taskId)
        const ms = t ? rReportDialogProject.milestones.find(m => m.id === t.milestoneId) : undefined
        return {
          log: l,
          taskId: l.taskId,
          taskTitle: t?.title ?? '任務',
          path: ms?.name ?? '',
          weekOf: l.weekOf ?? null,
          rejectedAt: l.reviewerRejectedAt!,
          rejectedBy: l.reviewerRejectedBy ?? null,
          note: l.reviewerNote ?? null,
          days: Math.max(0, Math.floor((Date.now() - new Date(l.reviewerRejectedAt!).getTime()) / 86400000)),
        }
      })
      .sort((a, b) => b.days - a.days)
  }, [rReportDialogProject, user])

  // 一鍵回到被駁回的那一週、選取該任務並解鎖編輯——R 不必自己算是哪一週
  const goFixRejected = (item: { taskId: string; weekOf: string | null }) => {
    if (item.weekOf) setRReportWeekOf(item.weekOf)
    setRDialogTab('active')
    setRSelectedTaskId(item.taskId)
    // 不自動解鎖編輯：要不要改由 R 自己決定（換週的 effect 也會把解鎖重設，設了也留不住）
    setRFlowPanelOpen(false)
  }

  // 審視歷程：本專案中指派給我的任務之回報/確認事件，新到舊
  const rReviewEvents = useMemo(() => {
    if (!rReportDialogProject || !user) return [] as RReviewEvent[]
    return (rReportDialogProject.reviewEvents || [])
      .filter(e => isSameUser(e.assignee, user))
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [rReportDialogProject, user])

  // ── 審核中心資料（只看「當責 A」的專案）──
  const reviewIsAccountable = useMemo(() => apiProjects.some(p => p.userRole === 'A'), [apiProjects])

  const reviewPendingItems = useMemo<ReviewItem[]>(() => {
    if (!user) return []
    const out: ReviewItem[] = []
    for (const p of apiProjects) {
      if (p.userRole !== 'A') continue
      const byId = new Map(p.tasks.map(t => [t.id, t]))
      const childrenOf = new Map<string, Task[]>()
      for (const t of p.tasks) if (t.parentId) { const a = childrenOf.get(t.parentId); if (a) a.push(t); else childrenOf.set(t.parentId, [t]) }
      for (const t of p.tasks) {
        if (!t.reportedDoneAt || t.completedAt || t.reviewedAt) continue // 已審核通過的離開待審佇列
        // 循序 gating：R 回報 100% 必須「先過 R主管審核」A 才看得到。
        //   有指定 R主管(報告有 authorReviewerName)時，要求該任務報告已核准(有 publishedAt)且無待審筆；
        //   沒指定 R主管則 fallback 直接進 A（舊流程）。
        const rLogs = p.taskLogs.filter(l => l.taskId === t.id && !l.reportOnly)
        if (rLogs.some(l => l.authorReviewerName)) {
          const hasApproved = rLogs.some(l => l.publishedAt)
          const hasPending = rLogs.some(l => !l.publishedAt && !l.reviewerRejectedAt)
          if (!hasApproved || hasPending) continue // 尚未經 R主管核准 → 先不進 A 審核佇列
        }
        const ms = p.milestones.find(m => m.id === t.milestoneId)
        const anc: string[] = []
        let cur = t.parentId ? byId.get(t.parentId) : undefined
        while (cur) { anc.unshift(cur.title); cur = cur.parentId ? byId.get(cur.parentId) : undefined }
        const path = [ms?.name, ...anc].filter(Boolean).join(' › ')
        // 檔案繼承：此任務 + 所有子孫任務的附件全帶上
        const descIds = new Set<string>([t.id])
        const stack = [...(childrenOf.get(t.id) || [])]
        while (stack.length) { const c = stack.pop()!; descIds.add(c.id); const k = childrenOf.get(c.id); if (k) stack.push(...k) }
        // 紀錄含此任務 + 所有子任務；附件掛在各列（呈現在細項上）
        const logRows: ReviewLogRow[] = []
        for (const l of p.taskLogs) {
          if (!descIds.has(l.taskId)) continue
          logRows.push({ log: l, srcTitle: l.taskId === t.id ? undefined : byId.get(l.taskId)?.title })
        }
        logRows.sort((a, b) => a.log.logDate.localeCompare(b.log.logDate))
        const fileCount = logRows.reduce((n, r) => n + (r.log.attachments?.length || 0), 0)
        out.push({ projectId: p.id, projectName: p.name, task: t, path, reporter: t.reportedDoneBy || '', reportedAt: t.reportedDoneAt, logRows, fileCount })
      }
    }
    return out.sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))
  }, [apiProjects, user])

  const reviewHistory = useMemo<RReviewEvent[]>(() => {
    const out: RReviewEvent[] = []
    for (const p of apiProjects) {
      if (p.userRole !== 'A') continue
      for (const e of (p.reviewEvents || [])) out.push({ ...e, projectId: p.id })
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [apiProjects])

  // R（執行者）視角：我這個任務的報告現在跑到哪、卡在誰手上。
  //   與 A/主管 共用同一套推導，所以三方看到的流程一定一致，不會各說各話。
  /**
   * 一個任務可能同時存在兩條審核鏈：原本的報告鏈，以及完成後補充鏈。
   * 混在一起算會得出自相矛盾的流程（實際踩過：標題說「流程已走完」，
   * 主管那一棒卻標「現在在這」）。所以先挑出「現在真正在跑的那一條」：
   *   有還沒核准的補充 → 畫補充鏈；否則 → 畫原本的報告鏈。
   */
  /**
   * 這筆紀錄屬於哪一條鏈。補充以「送出批次」分，不是以填報週——
   * 同一週送兩次就是兩批，各自送審、各自核准、各自撤回。
   * 舊資料沒有批次值時退回用填報週，至少不會全部混成一批。
   */
  const chainKeyOf = useCallback((l: TaskLog) =>
    l.postDoneSupplement ? `sup:${l.supplementBatch ?? l.weekOf ?? '_'}` : 'main', [])

  /** 這個任務有哪些鏈，依「主鏈 → 補充（新到舊）」排序。 */
  /**
   * 補充鏈的標籤：用「送出時間 + 筆數」。
   * 補充不綁週，週別對它沒意義；而同一天可能送好幾批，
   * 只到日期會出現兩個一模一樣的選項，所以要帶到分鐘。
   */
  const supplementChainLabel = useCallback((ls: TaskLog[]) => {
    const submitted = ls.map(l => l.createdAt).filter(Boolean).sort()[0]
    if (!submitted) return `補充 · 補交 · ${ls.length} 筆`
    const d = new Date(submitted)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `補充 · ${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} 送出 · ${ls.length} 筆`
  }, [])

  const chainsOf = useCallback((logs: TaskLog[]) => {
    const groups = new Map<string, TaskLog[]>()
    for (const l of logs) {
      const k = chainKeyOf(l)
      const a = groups.get(k); if (a) a.push(l); else groups.set(k, [l])
    }
    // 正式報告永遠在最前，補充依「送出時間」由舊到新——照事情發生的順序讀最直覺。
    //   不能用鍵的字串排：回填的 bf- 與 API 產生的批次 id 格式不同，字串序會亂。
    const submittedAt = (ls: TaskLog[]) => ls.map(l => l.createdAt ?? l.logDate).filter(Boolean).sort()[0] ?? ''
    return [...groups.entries()]
      .sort(([a, la], [b, lb]) =>
        a === 'main' ? -1 : b === 'main' ? 1 : submittedAt(la).localeCompare(submittedAt(lb)))
      .map(([key, ls]) => ({ key, logs: ls }))
  }, [chainKeyOf])

  const pickChain = useCallback((logs: TaskLog[], want?: string | null): TaskLog[] => {
    const groups = chainsOf(logs)
    if (groups.length === 0) return []
    const chosen = want ? groups.find(g => g.key === want) : null
    if (chosen) return chosen.logs
    // 自動：還在途（尚未納入更新紀錄）的那條優先——那是現在真正要處理的事
    const inFlight = groups.find(g => g.key !== 'main' && g.logs.some(l => !l.publishedAt))
    if (inFlight) return inFlight.logs
    return (groups.find(g => g.key === 'main') ?? groups[0]).logs
  }, [chainsOf])

  const rFlowOf = useCallback((taskId: string): ReviewFlow | null => {
    const p = rReportDialogProject
    if (!p) return null
    const t = p.tasks.find(tt => tt.id === taskId)
    if (!t) return null
    // 只看「我自己寫的」報告：別人代寫的那份不是我的旅程。
    // 若吃整個任務的報告，會出現「右欄說我的報告在被審、待確認卻查無此筆」的矛盾。
    const myLogs = pickChain(p.taskLogs.filter(l => l.taskId === taskId && isSameUser(l.author, user)), rFlowChainKey)
    const mr = p.memberReviewers?.find(m => isSameUser(t.assignee, { name: m.name }))
    const weekEnd = weekEndOf(rReportWeekOf)
    return buildReviewFlow({
      task: t,
      hasReviewer: myLogs.length > 0 ? undefined : !!mr?.reviewer,
      logs: myLogs,
      events: (p.reviewEvents ?? []).filter(e => e.taskId === taskId),
      activeThisWeek: shouldTrackReport(
        { assignee: t.assignee, status: t.status, startDate: t.startDate, endDate: t.endDate, completedAt: t.completedAt ?? null },
        rReportWeekOf, weekEnd,
      ),
      accountableName: p.accountableName ?? null,
    })
  }, [rReportDialogProject, rReportWeekOf, user, pickChain, rFlowChainKey])

  // R 右欄的目標任務：待完成看「選取中」那筆，待確認/完成區看「展開中」那筆
  const rFlowTargetId = useMemo(() => {
    if (rDialogTab === 'active') return rSelectedTaskId
    const [first] = [...rDoneExpanded]
    return first ?? null
  }, [rDialogTab, rSelectedTaskId, rDoneExpanded])
  const rSelectedFlow = useMemo(() => (rFlowTargetId ? rFlowOf(rFlowTargetId) : null), [rFlowTargetId, rFlowOf])
  const rSelectedFlowLogs = useMemo(() => {
    if (!rFlowTargetId || !rReportDialogProject || !user) return []
    // 只放 R 自己寫的。別人（例如當責）在同一任務上的補充不是他的紀錄，
    // 混進來會讓他以為自己交過某筆，也對不上他自己的審核鏈（rFlowOf 同樣只看自己的）。
    const mine = rReportDialogProject.taskLogs
      .filter(l => l.taskId === rFlowTargetId && isSameUser(l.author, user))
    // 預設列全部；選定某一條鏈才收斂（與當責端同一套規則）
    const scoped = rFlowChainKey ? pickChain(mine, rFlowChainKey) : mine
    return scoped.slice().sort((a, b) => a.logDate.localeCompare(b.logDate))
  }, [rFlowTargetId, rReportDialogProject, user, pickChain, rFlowChainKey])

  // R 換任務就回到「全部」
  useEffect(() => { setRFlowChainKey(null) }, [rFlowTargetId])

  // R 這個任務有哪幾條鏈
  const rChainInfo = useMemo(() => {
    const empty = { chains: [] as { key: string; label: string }[], activeKey: null as string | null }
    if (!rFlowTargetId || !rReportDialogProject || !user) return empty
    const mine = rReportDialogProject.taskLogs
      .filter(l => l.taskId === rFlowTargetId && isSameUser(l.author, user))
    const groups = chainsOf(mine)
    if (groups.length === 0) return empty
    const shown = pickChain(mine, rFlowChainKey)
    const activeKey = shown.length > 0 ? chainKeyOf(shown[0]) : null
    if (groups.length < 2) return { chains: [], activeKey }
    return {
      activeKey,
      chains: groups.map(g => ({
        key: g.key,
        label: g.key === 'main'
          ? '正式報告'
          : supplementChainLabel(g.logs),
      })),
    }
  }, [rFlowTargetId, rReportDialogProject, user, rFlowChainKey, pickChain, chainsOf, chainKeyOf])

  // 主管清單：先依週別篩選，再依「成員」或「任務」分組。
  //   週別是篩選條件不是分類軸——同一週內主管想切換的是「誰交了什麼」還是「哪些任務有報告」。
  const renderSupRows = (
    rows: { rv: Reviewee; s: ReviewSubmission | ReviewedSubmission }[],
    pid: string,
    keyOf: (authorId: string, taskId: string, weekOf: string | null, batch?: string | null) => string,
    emptyText: string,
    defaultTab: FlowPanelTab,
    /** 是否用週別收斂。收件匣（待審核）必須為 false——濾掉待辦等於把工作藏起來。 */
    withWeek: boolean,
  ) => {
    if (rows.length === 0) {
      return <p className="text-sm text-muted-foreground text-center px-4 py-8">{emptyText}</p>
    }
    // 先收斂到所選週別。沒有填報週的舊資料只在「全部週別」模式出現。
    const inWeek = !withWeek || supShowAllWeeks ? rows : rows.filter(r => r.s.weekOf === reviewTrackWeek)
    const hiddenCount = rows.length - inWeek.length
    // 被濾掉的筆數一定要講出來，否則主管會以為那些報告不存在
    const weekFooter = withWeek && (hiddenCount > 0 || supShowAllWeeks) ? (
      <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground border-t">
        {supShowAllWeeks
          ? <span>目前顯示全部 {rows.length} 筆</span>
          : <span>其他週別另有 <b className="text-foreground">{hiddenCount}</b> 筆</span>}
        <button type="button" onClick={() => setSupShowAllWeeks(v => !v)}
          className="ml-auto rounded border px-2 py-0.5 transition-colors hover:bg-muted hover:text-foreground">
          {supShowAllWeeks ? '只看所選週別' : '顯示全部週別'}
        </button>
      </div>
    ) : null
    if (inWeek.length === 0) {
      return (
        <>
          <p className="text-sm text-muted-foreground text-center px-4 py-8">這一週沒有報告</p>
          {weekFooter}
        </>
      )
    }
    // 依任務時沿用「填報追蹤」的樹狀順序（buildTrackTree 產出的 DFS 序），
    // 這樣主管看到的任務排列跟 WBS 一致，不會是散落的平面清單。
    const treeOrder = new Map<string, number>()
    let oi = 0
    for (const rv of (reviewDialogProject?.reviewees ?? [])) {
      for (const t of rv.tracking) if (!treeOrder.has(t.taskId)) treeOrder.set(t.taskId, oi++)
    }
    const shown = [...inWeek].sort((a, b) => {
      if (supViewBy === 'task') {
        const d = (treeOrder.get(a.s.taskId) ?? 1e9) - (treeOrder.get(b.s.taskId) ?? 1e9)
        if (d !== 0) return d
      }
      // 同組內新的週別排前面
      return (b.s.weekOf ?? '').localeCompare(a.s.weekOf ?? '')
    })

    // 分組：依成員＝人名當標題；依任務＝任務名當標題（同任務跨週的報告收在一起）
    const depthOf = new Map<string, number>()
    for (const rv of (reviewDialogProject?.reviewees ?? [])) {
      for (const t of rv.tracking) if (!depthOf.has(t.taskId)) depthOf.set(t.taskId, t.depth)
    }
    const groups = new Map<string, { title: string; avatar: string | null; depth: number; items: typeof shown }>()
    for (const r of shown) {
      const gk = supViewBy === 'member' ? `m:${r.rv.authorId}` : `t:${r.s.taskId}`
      const g = groups.get(gk)
      if (g) g.items.push(r)
      else groups.set(gk, {
        title: supViewBy === 'member' ? r.rv.authorName : r.s.taskTitle,
        avatar: supViewBy === 'member' ? r.rv.authorName : null,
        depth: supViewBy === 'task' ? (depthOf.get(r.s.taskId) ?? 0) : 0,
        items: [r],
      })
    }

    return (
      <div>
        {[...groups.entries()].map(([gk, g]) => (
          <div key={gk}>
            <div className="sticky top-0 z-10 flex items-center gap-1.5 border-y bg-muted/85 px-4 py-1.5 backdrop-blur">
              {g.avatar
                ? <FlowAvatar name={g.avatar} size={18} />
                : <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span className="text-[11px] font-medium text-muted-foreground truncate"
                style={g.depth ? { paddingLeft: g.depth * 12 } : undefined}>
                {g.depth ? '└ ' : ''}{g.title}
              </span>
              <span className="ml-auto shrink-0 rounded bg-background px-1.5 text-[11px] font-semibold tabular-nums">{g.items.length}</span>
            </div>
            <div className="divide-y divide-border/60">
              {g.items.map(({ rv, s: sub }) => {
                const k = keyOf(rv.authorId, sub.taskId, sub.weekOf, sub.batch ?? null)
                const f = supFlows.map.get(k)
                const brief = sub.logs.map(l => l.content).join('；')
                const outcome = 'outcome' in sub ? sub.outcome : null
                return (
                  <button key={k} type="button" onClick={() => selectSupFlow(k, defaultTab)}
                    className={cn('w-full text-left px-4 py-2 transition-colors border-l-2',
                      supFlowKey === k ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/40')}>
                    <div className="flex items-start gap-2">
                      {/* 群組已經講過的那一項，列上就不重複 */}
                      <div className="min-w-0 flex-1 text-sm font-medium truncate">
                        {supViewBy === 'member' ? sub.taskTitle : rv.authorName}
                      </div>
                      {outcome && (
                        <span className={cn('shrink-0 rounded px-2 py-0.5 text-xs font-semibold',
                          outcome === 'approved'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300')}>
                          {outcome === 'approved' ? '已核准' : '已駁回'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5" title={brief}>
                      {outcome === 'rejected' && 'note' in sub && sub.note ? `駁回原因：${sub.note}` : brief}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {f && <StageChip stage={f.stage} viewer="supervisor" days={f.stuckDays} />}
                      {/* 已框住單一週別時，每列再標一次週別是多餘的；沒框住就一定要標 */}
                      {(!withWeek || supShowAllWeeks) && sub.weekOf && (
                        <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 whitespace-nowrap">
                          {formatReportWeek(sub.weekOf)}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {weekFooter}
      </div>
    )
  }

  /** 待審核／已審核共用的工具列：週別（範圍）＋ 依成員／依任務（分類軸）。 */
  const renderSupToolbar = (withWeek: boolean) => (
    <div className="space-y-2 px-4 py-2.5 border-b">
      {withWeek && !supShowAllWeeks && <WeekPicker value={reviewTrackWeek} onChange={onTrackWeekChange} />}
      <div className="flex items-center gap-2">
        {withWeek && supShowAllWeeks && (
          <span className="text-xs text-muted-foreground">顯示全部週別</span>
        )}
        <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg w-fit ml-auto">
          {([['member', '依成員'], ['task', '依任務']] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setSupViewBy(v)}
              className={cn('px-2.5 py-1 text-xs rounded-md transition-colors',
                supViewBy === v ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  // 選取項目時一併決定右欄預設看哪一頁（審核情境看流程、瀏覽情境看內容）
  const selectReviewFlow = (taskId: string, defaultTab: FlowPanelTab = 'flow') => {
    setReviewFlowTaskId(taskId)
    setFlowTab(defaultTab)
  }
  const selectSupFlow = (key: string, defaultTab: FlowPanelTab = 'flow') => {
    setSupFlowKey(key)
    setFlowTab(defaultTab)
  }

  // 左欄清單：群組標題（麵包屑）+ 群組內項目。兩處清單（分頁／棒次視角）共用。
  const renderFlowGroups = (groups: { path: string; rows: ReviewFlow[] }[]) => (
    <div>
      {groups.map((g, gi) => (
        <div key={`${g.path}#${gi}`}>
          <div className="sticky top-0 z-10 border-b border-t bg-muted/85 px-4 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur truncate"
            title={g.path}>
            {g.path}
          </div>
          <div className="divide-y divide-border/60">
            {g.rows.map(flow => (
              <button key={flow.taskId} type="button" onClick={() => selectReviewFlow(flow.taskId, 'flow')}
                className={cn('w-full text-left px-4 py-2 transition-colors border-l-2',
                  reviewFlowTaskId === flow.taskId ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/40')}>
                {/* 工作類型固定在右上角：它是「這一列要你做什麼」，該和標題同高、位置一致，
                    混在下排的中繼資料裡會隨著徽章數量左右飄移。 */}
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 text-sm font-medium truncate">{flow.title}</div>
                  {flow.pendingAction && (
                    <span
                      title={flow.pendingAction === 'review-report'
                        ? '你要審這份週報。通過後報告進入更新紀錄，任務仍在進行。'
                        : flow.pendingAction === 'review-supplement'
                          ? '主管已核准這筆完成後補充，等你收尾。通過即納入更新紀錄；不會改變任務的完成日與進度。'
                          : '執行者已回報 100% 完成，你要確認。通過後任務標記完成、甘特與里程碑同步。'}
                      className={cn('shrink-0 text-xs rounded px-2 py-0.5 font-medium cursor-help',
                        flow.pendingAction === 'review-report'
                          ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                          : flow.pendingAction === 'review-supplement'
                            ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300')}>
                      {flow.pendingAction === 'review-report' ? '要審週報'
                        : flow.pendingAction === 'review-supplement' ? '要審補充' : '要確認完成'}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  {flow.assignee && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <FlowAvatar name={flow.assignee} size={16} />{flow.assignee}
                    </span>
                  )}
                  <StageChip stage={flow.stage} viewer="accountable" days={flow.stuckDays} />
                  {/* 只在「真的還有東西要 A 審」時才標。執行中(報告已納入紀錄)與已完成都沒有待辦，
                      標了只會讓 A 以為自己還有事沒做。 */}
                  {flow.noReviewer && flow.stage !== 'done' && flow.stage !== 'running' && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-orange-700 dark:text-orange-400"
                      title="此成員未設報告審核主管，報告直接由你審核">
                      <AlertTriangle className="h-3 w-3" />由你代審
                    </span>
                  )}
                  {/* 這份清單不依週別收斂，所以每列要標出是哪一週的報告 */}
                  {flow.reportWeekLabel && (
                    <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 whitespace-nowrap">
                      {flow.reportWeekLabel}
                    </span>
                  )}
                  {flow.attachments > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                      <Paperclip className="h-3 w-3" />{flow.attachments}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  // 開啟某專案的週報審核
  const openReviewForProject = (projectId: string) => {
    setReviewProjectId(projectId)
    setReviewTab('pending')
    setReviewMemberExpanded(new Set())
    setReviewHistoryPage(0)
    setReviewReportWeek(rCurrentMonday)
    setReviewFlowTaskId(null)
    setReviewStageFilter(null)
    setReviewCenterOpen(true)
  }
  // 依所選專案過濾（從專案列開啟時只看該專案）
  const reviewShownItems = useMemo(
    () => reviewProjectId ? reviewPendingItems.filter(i => i.projectId === reviewProjectId) : reviewPendingItems,
    [reviewPendingItems, reviewProjectId],
  )
  const reviewShownHistory = useMemo(
    () => reviewProjectId ? reviewHistory.filter(e => e.projectId === reviewProjectId) : reviewHistory,
    [reviewHistory, reviewProjectId],
  )
  const reviewShownName = useMemo(
    () => reviewProjectId ? apiProjects.find(p => p.id === reviewProjectId)?.name : undefined,
    [apiProjects, reviewProjectId],
  )
  // 成員週報（依所選週別）：同時算出「依成員」與「依任務」兩種視圖。
  // 「本週該做」= 任務有指派、且起訖與本週重疊（未開始/已結束的不算，避免誤判「未填」）。
  type ReviewWeekTask = { taskId: string; title: string; ctx: string; active: boolean; filled: boolean; reported: boolean; reviewed: boolean; completed: boolean; logs: TaskLog[]; reviewState: ReportReviewState }
  const reviewWeekReport = useMemo(() => {
    const empty = {
      memberRows: [] as { name: string; expectedCount: number; filledCount: number; missing: boolean; tasks: ReviewWeekTask[] }[],
      taskTree: [] as { msId: string; msName: string; nodes: ReviewTaskNode[] }[],
      missingMembers: 0, missingTasks: 0,
    }
    if (!reviewProjectId) return empty
    const p = apiProjects.find(pp => pp.id === reviewProjectId)
    if (!p) return empty
    const [y, m, d] = reviewReportWeek.split('-').map(Number)
    const weekStart = reviewReportWeek
    const endDate = new Date(y, m - 1, d + 6)
    const weekEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    const byId = new Map(p.tasks.map(t => [t.id, t]))
    const ctxOf = (taskId: string) => {
      const t = byId.get(taskId); if (!t) return ''
      const ms = p.milestones.find(mm => mm.id === t.milestoneId)
      const anc: string[] = []
      let cur = t.parentId ? byId.get(t.parentId) : undefined
      while (cur) { anc.unshift(cur.title); cur = cur.parentId ? byId.get(cur.parentId) : undefined }
      return [ms?.name, ...anc].filter(Boolean).join(' › ')
    }
    // 「該填報告」與「已填」判定與 R主管 填報追蹤共用同一套（lib/report-tracking）：
    //  逾期未完成也持續每週追；已填以報告 weekOf 為準（舊資料 fallback logDate）。
    const overlaps = (t: Task) => shouldTrackReport(
      { assignee: t.assignee, status: t.status, startDate: t.startDate, endDate: t.endDate, completedAt: (t as { completedAt?: string }).completedAt ?? null },
      weekStart, weekEnd,
    )
    const activeTasks = p.tasks.filter(overlaps)
    // 排除當責在撰寫台寫的補充（reportOnly）。補充不走審核流程，送出後直接進更新紀錄，
    //   不該出現在成員名單、任務清單、筆數或未填判定裡。在源頭濾掉，下游就全部一致。
    const weekLogs = p.taskLogs.filter(l =>
      !l.reportOnly && reportCountsForWeek({ weekOf: l.weekOf, logDate: l.logDate }, weekStart, weekEnd))
    const logsByTask = new Map<string, TaskLog[]>()
    const logsByAuthorTask = new Map<string, TaskLog[]>()
    for (const l of weekLogs) {
      ;(logsByTask.get(l.taskId) || logsByTask.set(l.taskId, []).get(l.taskId)!).push(l)
      const k = `${l.author}|${l.taskId}`
      ;(logsByAuthorTask.get(k) || logsByAuthorTask.set(k, []).get(k)!).push(l)
    }
    const sortLogs = (a: TaskLog, b: TaskLog) => a.logDate.localeCompare(b.logDate)

    // 依任務（樹狀）：顯示 active 任務 + 其祖先（結構用），依里程碑分組
    const showIds = new Set<string>()
    for (const t of activeTasks) {
      showIds.add(t.id)
      let cur = t.parentId ? byId.get(t.parentId) : undefined
      while (cur) { showIds.add(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined }
    }
    const childrenOf = new Map<string, Task[]>()
    for (const t of p.tasks) {
      if (!showIds.has(t.id) || !t.parentId || !showIds.has(t.parentId)) continue
      const arr = childrenOf.get(t.parentId) || childrenOf.set(t.parentId, []).get(t.parentId)!
      arr.push(t)
    }
    const buildNode = (t: Task, depth: number): ReviewTaskNode => {
      const logs = (logsByTask.get(t.id) || []).slice().sort(sortLogs)
      // 審核狀態看整個任務的報告（不只本週），與「待你確認」分頁一致
      const allLogs = p.taskLogs.filter(l => l.taskId === t.id)
      return {
        taskId: t.id, title: t.title, assignee: t.assignee, depth,
        active: !!t.assignee && overlaps(t), filled: logs.length > 0, reported: !!t.reportedDoneAt, reviewed: !!t.reviewedAt,
        completed: !!(t as { completedAt?: string }).completedAt || t.status === 'done', logs,
        reviewState: computeReportReviewState(allLogs),
        children: (childrenOf.get(t.id) || []).map(c => buildNode(c, depth + 1)),
      }
    }
    const taskTree = p.milestones.map(ms => {
      const tops = p.tasks.filter(t => showIds.has(t.id) && t.milestoneId === ms.id && (!t.parentId || !showIds.has(t.parentId)))
      return { msId: ms.id, msName: ms.name, nodes: tops.map(t => buildNode(t, 0)) }
    }).filter(g => g.nodes.length > 0)
    const missingTasks = activeTasks.filter(t => !(logsByTask.get(t.id)?.length)).length

    // 依成員：每人本週「該做的任務」(active) ∪「本週有寫的任務」，逐一標已填/未填
    // 「成員週報」列的是執行者的填報狀況。weekLogs 已在源頭濾成「負責人自己的報告」，
    //   所以這裡不會混進當責的補充。
    const memberNames = new Set<string>()
    // 未指派的任務沒有「這一列該由誰填」可言，列出來只會是一列空名字
    for (const t of activeTasks) if (t.assignee?.trim()) memberNames.add(t.assignee)
    for (const l of weekLogs) memberNames.add(l.author)
    const memberRows = [...memberNames].sort().map(name => {
      // owned = 該員本週該做(active) ∪ 本週有寫的任務。平面列表呈現，但排序沿用樹狀順序（父在子前、同層依序）。
      const ownedIds = new Set<string>()
      for (const t of activeTasks) if (t.assignee === name) ownedIds.add(t.id)
      for (const l of weekLogs) if (l.author === name) ownedIds.add(l.taskId)
      const tasks: ReviewWeekTask[] = buildTrackTree(ownedIds, p.tasks)
        .filter(n => n.owned) // 只留該員的任務（結構祖先僅用來決定排序，不顯示）
        .map(({ node }) => {
          const tid = node.id
          const t = byId.get(tid)
          const logs = (logsByAuthorTask.get(`${name}|${tid}`) || []).slice().sort(sortLogs)
          // 審核狀態看「整個任務」的報告（不只本週），與「待你確認」分頁一致：
          //   別週只要還有一筆待審，就是「主管審核中」，不能因本週沒交就誤標「待你確認」。
          const allLogs = p.taskLogs.filter(l => l.taskId === tid && l.author === name)
          return { taskId: tid, title: t?.title || '任務', ctx: t ? ctxOf(tid) : '', active: !!t && t.assignee === name && overlaps(t), filled: logs.length > 0, reported: !!t?.reportedDoneAt, reviewed: !!t?.reviewedAt, completed: !!(t as { completedAt?: string } | undefined)?.completedAt || t?.status === 'done', logs, reviewState: computeReportReviewState(allLogs) }
        })
      const expectedCount = tasks.filter(ti => ti.active).length
      const filledCount = tasks.filter(ti => ti.active && ti.filled).length
      return { name, expectedCount, filledCount, missing: expectedCount > 0 && filledCount === 0, tasks }
    }).sort((a, b) => (a.missing === b.missing ? 0 : a.missing ? -1 : 1))
    const missingMembers = memberRows.filter(r => r.missing).length

    return { memberRows, taskTree, missingMembers, missingTasks }
  }, [apiProjects, reviewProjectId, reviewReportWeek])
  const reviewMissingCount = reviewMemberView === 'task' ? reviewWeekReport.missingTasks : reviewWeekReport.missingMembers

  // ── 流程面板（右欄）──────────────────────────────────────
  // 由 taskId 組出完整的四棒流程鏈。報告刻意取「整個任務」的（不限本週）：
  // 別週還卡在主管手上時，A 在本週視圖也要看得到，才不會誤以為球在自己這。
  //
  // 註：舊的「成員週報」badge 會再依 author 過濾（l.author === name）。這裡刻意不濾——
  //     流程是任務層級的性質，任務中途換人時，前手還卡在主管那邊的報告也該讓 A 看見，
  //     否則新負責人的列會顯示「本週未交」而掩蓋掉真正卡住的那一棒。
  const reviewFlowOf = useCallback((taskId: string): ReviewFlow | null => {
    for (const p of apiProjects) {
      const t = p.tasks.find(tt => tt.id === taskId)
      if (!t) continue
      const byId = new Map(p.tasks.map(x => [x.id, x]))
      const ms = p.milestones.find(m => m.id === t.milestoneId)
      const anc: string[] = []
      let cur = t.parentId ? byId.get(t.parentId) : undefined
      while (cur) { anc.unshift(cur.title); cur = cur.parentId ? byId.get(cur.parentId) : undefined }
      const weekEnd = weekEndOf(reviewReportWeek)
      // 這位執行者在本專案有沒有報告審核主管。沒有 → 流程圖不畫「R主管審核」那一棒，
      // 因為後端送出報告時就已 fallback 通知當責（task-logs/batch: routedTo='accountable'）。
      // 只算真正走審核的報告。當責在撰寫台寫的補充帶 reportOnly，它不進審核、送出直接進更新紀錄，
      // 混進來會算出自相矛盾的狀態（踩過：當責在 R 的任務上補一筆說明，那筆未發布，
      // 於是 A 看到「主管審核中」，R 卻看到自己的報告「已駁回」）。
      const taskLogs = pickChain(p.taskLogs.filter(l => l.taskId === taskId && !l.reportOnly), flowChainKey)
      const mr = p.memberReviewers?.find(m => isSameUser(t.assignee, { name: m.name }))
      return buildReviewFlow({
        task: t,
        hasReviewer: taskLogs.length > 0 ? undefined : !!mr?.reviewer,
        logs: taskLogs,
        events: (p.reviewEvents ?? []).filter(e => e.taskId === taskId),
        activeThisWeek: shouldTrackReport(
          { assignee: t.assignee, status: t.status, startDate: t.startDate, endDate: t.endDate, completedAt: t.completedAt ?? null },
          reviewReportWeek, weekEnd,
        ),
        path: [ms?.name, ...anc].filter(Boolean).join(' › ') || null,
        accountableName: p.accountableName ?? user?.name ?? null,
      })
    }
    return null
  }, [apiProjects, reviewReportWeek, user, pickChain, flowChainKey])

  // 本專案有幾位成員沒設報告審核主管（＝其報告會直接落到當責身上）
  const reviewNoReviewerCount = useMemo(() => {
    const p = apiProjects.find(pp => pp.id === reviewProjectId)
    if (!p?.memberReviewers) return 0
    // 只算「會交報告的人」＝身上有任務的人。團隊裡的當責自己、以及不背任務的角色
    //   本來就不會送報告給人審，把他們算進來會變成永遠消不掉的假警告
    //   （實際踩過：專案只有當責自己未設，畫面就一直掛著「1 位成員未設」）。
    const assignees = new Set(p.tasks.map(t => (t.assignee || '').trim()).filter(Boolean))
    return p.memberReviewers.filter(m => !m.reviewer && [...assignees].some(a => isSameUser(a, { name: m.name }))).length
  }, [apiProjects, reviewProjectId])

  const reviewSelectedFlow = useMemo(
    () => (reviewFlowTaskId ? reviewFlowOf(reviewFlowTaskId) : null),
    [reviewFlowTaskId, reviewFlowOf],
  )
  // 右欄若正輪到 A，動作按鈕需要對應的待審項目
  // A 代審時的目標：該任務目前「未發布、未被駁回」的那批報告（同作者、同填報週）
  const reviewSelectedReport = useMemo(() => {
    if (!reviewFlowTaskId) return null
    for (const p of apiProjects) {
      const pending = p.taskLogs
        .filter(l => l.taskId === reviewFlowTaskId && !l.publishedAt && !l.reviewerRejectedAt)
        .sort((a, b) => (a.createdAt ?? a.logDate).localeCompare(b.createdAt ?? b.logDate))
      if (pending.length === 0) continue
      const first = pending[0]
      if (!first.authorId) return null // 舊 payload 沒有 authorId 就不給操作，避免打錯對象
      return { projectId: p.id, taskId: reviewFlowTaskId, authorId: first.authorId, weekOf: first.weekOf ?? null, batch: first.supplementBatch ?? null }
    }
    return null
  }, [apiProjects, reviewFlowTaskId])

  // 當責要撤回補充時的目標：一定要鎖定「右欄目前顯示的那一批」。
  //   只用任務+週別去找，會把同一週的其他批補充一起撤掉。
  const reviewSelectedApprovedSupplement = useMemo(() => {
    if (!reviewFlowTaskId) return null
    const p = apiProjects.find(pp => pp.tasks.some(t => t.id === reviewFlowTaskId))
    if (!p) return null
    const chain = pickChain(
      p.taskLogs.filter(l => l.taskId === reviewFlowTaskId && !l.reportOnly),
      flowChainKey,
    )
    const first = chain[0]
    if (!first?.authorId || !first.postDoneSupplement) return null
    if (!chain.some(l => l.publishedAt)) return null // 還沒進更新紀錄，沒有「通過」可撤
    return {
      projectId: p.id, taskId: reviewFlowTaskId, authorId: first.authorId,
      weekOf: first.weekOf ?? null, batch: first.supplementBatch ?? null,
    }
  }, [apiProjects, reviewFlowTaskId, pickChain, flowChainKey])

  useEffect(() => { setFlowChainKey(null) }, [reviewFlowTaskId])

  // 這個任務有哪幾條鏈可切，以及目前顯示的是哪一條
  const reviewChainInfo = useMemo(() => {
    const empty = { chains: [] as { key: string; label: string; active: boolean; onSelect: () => void }[], activeKey: null as string | null }
    if (!reviewFlowTaskId) return empty
    const p = apiProjects.find(pp => pp.tasks.some(t => t.id === reviewFlowTaskId))
    if (!p) return empty
    const ls = p.taskLogs.filter(l => l.taskId === reviewFlowTaskId && !l.reportOnly)
    const groups = chainsOf(ls)
    if (groups.length === 0) return empty
    const shownLogs = pickChain(ls, flowChainKey)
    const activeKey = shownLogs.length > 0 ? chainKeyOf(shownLogs[0]) : null
    if (groups.length < 2) return { chains: [], activeKey }
    return {
      activeKey,
      chains: groups.map(g => ({
        key: g.key,
        // 正式報告＝任務本身的報告鏈（跨週，驅動進度與完成）；
        //   補充可能有很多批，標上週別才分得出是哪一批
        label: g.key === 'main'
          ? '正式報告'
          : supplementChainLabel(g.logs),
      })),
    }
  }, [apiProjects, reviewFlowTaskId, flowChainKey, pickChain, chainsOf, chainKeyOf])

  const reviewSelectedItem = useMemo(
    () => reviewPendingItems.find(i => i.task.id === reviewFlowTaskId) ?? null,
    [reviewPendingItems, reviewFlowTaskId],
  )
  // 右欄底部的工作紀錄
  const reviewSelectedLogs = useMemo(() => {
    if (!reviewFlowTaskId) return []
    // 排除當責的補充（reportOnly）——與流程的取樣範圍一致。
    //   補充混進來會被標上「未進紀錄」之類的審核狀態，讓人以為那筆也卡在某個審核關卡。
    const proj = apiProjects.find(p => p.tasks.some(t => t.id === reviewFlowTaskId))
    if (!proj) return []
    const all = proj.taskLogs.filter(l => l.taskId === reviewFlowTaskId && !l.reportOnly)
    // 預設（flowChainKey=null）列出整個任務的紀錄；選定某一條鏈才收斂到那一條。
    //   篩選要同時作用在流程與紀錄，不然會出現「選了補充，紀錄卻還列著本週報告」的錯覺。
    const scoped = flowChainKey ? pickChain(all, flowChainKey) : all
    return scoped.slice().sort((a, b) => a.logDate.localeCompare(b.logDate))
  }, [apiProjects, reviewFlowTaskId, pickChain, flowChainKey])

  // 管線列計數：以「本週該追蹤 ∪ 待你確認」的任務為母體，逐一歸棒
  const reviewPipeline = useMemo(() => {
    const counts: PipelineCounts = { unfilled: 0, supervisor: 0, accountable: 0, done: 0, running: 0 }
    const byTask = new Map<string, ReviewFlow>()
    const ids = new Set<string>()
    for (const r of reviewWeekReport.memberRows) for (const t of r.tasks) ids.add(t.taskId)
    for (const it of reviewShownItems) ids.add(it.task.id)
    // 已完成的任務也要進母體。追蹤用的 shouldTrackReport() 對完成任務回 false（完成了就不用再催填報），
    // 但「已完成」這一棒若永遠是 0，A 就走不到完成的任務，也就找不到撤回完成確認的入口。
    const proj = apiProjects.find(p => p.id === reviewProjectId)
    for (const t of proj?.tasks ?? []) {
      if (t.completedAt || t.status === 'done') ids.add(t.id)
    }
    for (const id of ids) {
      const f = reviewFlowOf(id)
      if (!f) continue
      counts[f.stage]++
      byTask.set(id, f)
    }
    return { counts, byTask }
  }, [reviewWeekReport, reviewShownItems, reviewFlowOf, apiProjects, reviewProjectId])

  // 任務在專案中的固定排序位置。清單一律照這個順序呈現，使用者才對得上甘特／看板。
  const taskOrderIndex = useMemo(() => {
    const m = new Map<string, number>()
    let base = 0
    for (const p of apiProjects) {
      const msIdx = new Map(p.milestones.map((ms, i) => [ms.id, i]))
      p.tasks.forEach((t, i) => {
        m.set(t.id, base + (msIdx.get(t.milestoneId) ?? 9_999) * 10_000 + i)
      })
      base += 100_000_000
    }
    return m
  }, [apiProjects])
  const byProjectOrder = useCallback(
    (a: ReviewFlow, b: ReviewFlow) =>
      (taskOrderIndex.get(a.taskId) ?? Number.MAX_SAFE_INTEGER) - (taskOrderIndex.get(b.taskId) ?? Number.MAX_SAFE_INTEGER),
    [taskOrderIndex],
  )

  // 依麵包屑把連續同路徑的項目收成群組，讓群組標題名副其實
  const groupByPath = useCallback((rows: ReviewFlow[]) => {
    const out: { path: string; rows: ReviewFlow[] }[] = []
    for (const f of rows) {
      const path = f.path || '（未分類）'
      const last = out[out.length - 1]
      if (last && last.path === path) last.rows.push(f)
      else out.push({ path, rows: [f] })
    }
    return out
  }, [])

  // 球在 A 手上的全部項目：代主管審報告 + 確認 100% 完成。「待你處理」分頁用這份，
  // 與 accountable 棒次同一個資料來源，兩邊不會再對不起來。
  const reviewActionableRows = useMemo(() => {
    const rows: ReviewFlow[] = []
    for (const [, f] of reviewPipeline.byTask) {
      if (f.stage === 'accountable') rows.push(f)
    }
    return groupByPath(rows.sort(byProjectOrder))
  }, [reviewPipeline, byProjectOrder, groupByPath])

  // 選了棒次時，左欄改看這份跨分頁的扁平清單（卡最久的排前面）
  const reviewStageRows = useMemo(() => {
    if (!reviewStageFilter) return []
    const rows: ReviewFlow[] = []
    for (const [, f] of reviewPipeline.byTask) {
      if (f.stage === reviewStageFilter) rows.push(f)
    }
    return groupByPath(rows.sort(byProjectOrder))
  }, [reviewStageFilter, reviewPipeline, byProjectOrder, groupByPath])


  // 履歷分頁（一頁 10 筆）
  const REVIEW_HISTORY_PAGE_SIZE = 10
  const reviewHistoryPageCount = Math.max(1, Math.ceil(reviewShownHistory.length / REVIEW_HISTORY_PAGE_SIZE))
  const reviewHistoryClampedPage = Math.min(reviewHistoryPage, reviewHistoryPageCount - 1)
  const reviewHistoryPageItems = reviewShownHistory.slice(
    reviewHistoryClampedPage * REVIEW_HISTORY_PAGE_SIZE,
    (reviewHistoryClampedPage + 1) * REVIEW_HISTORY_PAGE_SIZE,
  )

  const refreshMyTasks = useCallback(async () => {
    if (!user) return
    const res = await fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
    if (res.ok) { const data = await res.json(); setApiProjects(data.projects ?? []) }
  }, [user])

  // 撤回：把流程往回退一棒。必填原因——被撤回的人若不知道為什麼，只會回頭來問。
  const doRevoke = async () => {
    const t = revokeTarget
    const reason = revokeReason.trim()
    if (!t || !reason || !user) return
    setRevokeBusy(true)
    try {
      if (t.kind === 'confirm') {
        const res = await fetch(`/api/projects/${t.projectId}/tasks/${t.taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revokeConfirm: true, revokeReason: reason, reviewActor: user.name }),
        })
        if (!res.ok) { toast.error('撤回失敗，請稍後再試'); return }
        toast.success('已撤回確認，任務回到「待你處理」')
      } else {
        const res = await fetch('/api/report-reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reviewerEmail: user.email, projectId: t.projectId, taskId: t.taskId,
            authorId: t.authorId, weekOf: t.weekOf, action: 'revoke', note: reason,
            supplement: t.supplement, batch: t.batch, as: t.as ?? 'reviewer',
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          // 409＝下游已經動過，必須由下游先撤（後端回的訊息已說明該找誰）
          toast.error(d.error || '撤回失敗，請稍後再試')
          return
        }
        toast.success('已撤回核准，報告退回待審')
      }
      setRevokeTarget(null); setRevokeReason('')
      await refreshMyTasks()
      await refetchReviewInbox()
    } catch { toast.error('撤回失敗，請稍後再試') }
    finally { setRevokeBusy(false) }
  }

  // A 代審報告：該成員未設報告審核主管時，由當責直接核准／駁回。
  //   走的是 R主管 同一支 API（/api/report-reviews），後端授權已放行「無主管時由當責代審」。
  const aReviewReport = async (action: 'approve' | 'reject', note?: string) => {
    const t = reviewSelectedReport
    if (!t || !user?.email) return
    setAReportBusy(t.taskId)
    try {
      const res = await fetch('/api/report-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerEmail: user.email, ...t, action, note,
          // 補充的最後一關是當責；代主管審報告（成員未設主管）則是頂主管的缺
          as: reviewSelectedFlow?.pendingAction === 'review-supplement' ? 'accountable' : 'reviewer',
          supplement: reviewSelectedFlow?.supplement ?? false,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || '操作失敗'); return }
      const d = await res.json().catch(() => ({}))
      if (d.noop) toast.info('此報告已審核過，已為你重新整理')
      else toast.success(action === 'approve' ? '已通過，報告進入更新紀錄' : '已駁回，退回執行者')
      await refreshMyTasks()
    } catch { toast.error('操作失敗') }
    finally { setAReportBusy(null) }
  }

  // A 審核通過＝確認 R 回報的 100% 完成 → 標記完成（甘特 100% + 移入完成區 + 里程碑同步）。
  const reviewConfirm = async (item: ReviewItem) => {
    if (!user) return
    setReviewProcessing(item.task.id)
    try {
      // 完成歸屬「本週」→ 更新紀錄依此週分組
      const now = new Date(); const day = now.getDay(); const diff = now.getDate() - day + (day === 0 ? -6 : 1)
      const mon = new Date(now); mon.setDate(diff)
      const completedWeekOf = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
      const res = await fetch(`/api/projects/${item.projectId}/tasks/${item.task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedDone: true, markComplete: true, completedWeekOf, reviewEvent: 'confirmed', reviewActor: user.name }),
      })
      if (!res.ok) throw new Error()
      await refreshMyTasks()
    } catch { setRErrorMsg('審核失敗，請稍後再試') } finally { setReviewProcessing(null) }
  }

  // A 駁回（退回給執行者重做，附原因）
  const reviewDoReject = async () => {
    if (!user || !reviewRejectItem) return
    const it = reviewRejectItem
    const hasReviewerForReject = !!reviewFlowOf(it.taskId) && !reviewFlowOf(it.taskId)!.noReviewer
    setReviewProcessing(it.taskId)
    try {
      const res = await fetch(`/api/projects/${it.projectId}/tasks/${it.taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // 逐棒回退：有審核主管就退給主管（報告收回待審、保留 R 的回報），
        // 由主管決定是否再退給 R；沒有主管（當責代審）才直接退回 R。
        body: JSON.stringify(hasReviewerForReject
          ? { rejectToReviewer: true, reviewEvent: 'rejected', reviewActor: user.name, reviewNote: reviewRejectReason.trim() || undefined }
          : { reportedDone: false, reviewEvent: 'rejected', reviewActor: user.name, reviewNote: reviewRejectReason.trim() || undefined }),
      })
      // 帶出後端訊息，不要只丟一句「請稍後再試」讓人無從判斷
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || '')
      }
      setReviewRejectItem(null); setReviewRejectReason('')
      toast.success(hasReviewerForReject ? '已駁回，報告退回主管重新審核' : '已駁回，任務退回執行者')
      await refreshMyTasks()
      await refetchReviewInbox()
    } catch (e) {
      setRErrorMsg((e as Error).message || '駁回失敗，請稍後再試')
    } finally { setReviewProcessing(null) }
  }

  // 回報狀態徽章：區分「已回報完成（送 A 審核）」與「只是填了工作紀錄、還沒回報」

  // TaskLog → 工作紀錄表格的形狀。狀態與駁回原因要一起帶，右欄才看得到「哪一筆被退、為什麼」。
  const toLogRows = (logs: TaskLog[]) => logs.map(l => ({
    id: l.id, logDate: l.logDate, content: l.content, attachments: l.attachments,
    status: (
      // 已納入更新紀錄：已發布，或 7/12 前的舊資料（靠寬限顯示）
      isReportVisible(l) ? 'approved'
        : l.reviewerRejectedAt ? 'rejected'
          // 「待審」要有人在審才成立。作者沒有審核主管時（例：當責自己寫的補充），
          // 沒有任何人在審它，只是還沒被納入紀錄——標成待審會讓人以為卡在某人身上。
          : l.authorReviewerName ? 'pending' : 'unpublished'
    ) as 'approved' | 'rejected' | 'pending' | 'unpublished',
    rejectNote: l.reviewerNote ?? null,
    rejectedBy: l.reviewerRejectedBy ?? null,
    supplement: !!l.postDoneSupplement,
  }))

  // 週報審核：某任務本週紀錄的小表格（日期／內容／附件）。附件＝icon+數量，hover 展開可下載清單。
  const renderReviewLogs = (logs: { id: string; logDate: string; content: string; attachments?: TaskLogAttachment[]; status?: 'pending' | 'approved' | 'rejected' | 'unpublished'; rejectNote?: string | null; rejectedBy?: string | null; supplement?: boolean }[]) => (
    <div className="max-h-[200px] overflow-y-auto border-t border-b bg-background">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur"><tr className="text-muted-foreground">
          <th className="text-left font-medium px-2 py-1.5 w-[52px] border-b">日期</th>
          <th className="text-left font-medium px-2 py-1.5 border-b">工作內容</th>
          <th className="text-center font-medium px-2 py-1.5 w-[44px] border-b">附件</th>
        </tr></thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id} className="border-b border-border/40 last:border-b-0 align-top hover:bg-muted/30">
              <td className="px-2 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap align-top">
                {new Date(l.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                {l.status === 'pending' && <span className="ml-1 inline-block rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 text-[11px] font-medium align-middle" title="已送出，等審核主管核准後才會進入更新紀錄">待主管審</span>}
                {l.status === 'approved' && <span className="ml-1 inline-block rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-1.5 py-0.5 text-[11px] font-medium align-middle" title="已進入官方更新紀錄">已進紀錄</span>}
                {l.status === 'unpublished' && <span className="ml-1 inline-block rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[11px] font-medium align-middle" title="還沒進入更新紀錄。此筆沒有指定審核主管，會在當責送出週報時一併納入">未進紀錄</span>}
                {l.status === 'rejected' && <span className="ml-1 inline-block rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-1.5 py-0.5 text-[11px] font-medium align-middle" title="被駁回，需修改後重新送出">已退回</span>}

              </td>
              <td className="px-2 py-1.5 text-foreground/85 whitespace-pre-wrap break-words">
                {l.supplement && (
                  <span className="mr-1.5 inline-block rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 align-middle dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                    title="執行者在任務完成後補交的資料：照常審核，但不影響完成日與進度">完成後補充</span>
                )}
                {l.content}
              </td>
              <td className="px-2 py-1.5 text-center">
                {l.attachments && l.attachments.length > 0 ? (
                  <HoverCard openDelay={80} closeDelay={120}>
                    <HoverCardTrigger asChild>
                      <button className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:bg-primary/10 rounded px-1.5 py-0.5"><Paperclip className="h-3 w-3" />{l.attachments.length}</button>
                    </HoverCardTrigger>
                    <HoverCardContent align="end" className="w-60 p-2">
                      <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                        {l.attachments.map((att, ai) => (
                          <a key={ai} href={att.url} download={att.name} target="_blank" rel="noopener" className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted text-xs">
                            {att.type === 'image' ? <img src={att.url} alt={att.name} className="h-8 w-8 rounded object-cover border shrink-0" /> : <span className="h-8 w-8 rounded border bg-muted flex items-center justify-center shrink-0"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                            <span className="truncate flex-1">{att.name}</span>
                          </a>
                        ))}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                ) : <span className="text-muted-foreground/30">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // 依任務樹狀節點（遞迴，縮排呈現階層）
  const renderReviewTaskNode = (node: ReviewTaskNode): React.ReactNode => {
    return (
      <div key={node.taskId}>
        <div
          className={cn('flex items-center gap-2 py-2 pr-3 border-b border-border/40 cursor-pointer transition-colors border-l-2',
            reviewFlowTaskId === node.taskId ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/40')}
          style={{ paddingLeft: 12 + node.depth * 18 }}
          onClick={() => selectReviewFlow(node.taskId, 'logs')}
        >
          {node.depth > 0 && <span className="text-muted-foreground/40 text-xs select-none shrink-0">└</span>}
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{node.title}</div>
            <div className="text-[11px] text-muted-foreground">負責人：{node.assignee || '未指派'}</div>
          </div>
          {(() => {
            const f = reviewPipeline.byTask.get(node.taskId)
            if (!f) return null
            return (
              <span className="flex items-center gap-1 shrink-0">
                <StageChip stage={f.stage} viewer="accountable" days={f.stuckDays} />
                {f.noReviewer && <AlertTriangle className="h-3 w-3 text-orange-600 dark:text-orange-400 shrink-0" aria-label="未設審核主管，由當責代審" />}
              </span>
            )
          })()}
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </div>
        {node.children.map(renderReviewTaskNode)}
      </div>
    )
  }

  // 本週（週一）字串，用來判斷選到的週別是否為當週（過去/未來週預設唯讀）
  const rCurrentMonday = useMemo(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  }, [])
  const rIsCurrentWeek = rReportWeekOf === rCurrentMonday
  const rReadonly = !rIsCurrentWeek && !rEditPastUnlocked

  // Check which tasks have logs in the selected week (只看待完成任務)
  const rTaskWeekStatus = useMemo(() => {
    if (!rReportDialogProject) return new Map<string, { status: 'none' | 'reviewing' | 'rejected' | 'published'; reviewerName: string | null; waitDays: number }>()
    const [y, m, d] = rReportWeekOf.split('-').map(Number)
    const weekStart = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const endDate = new Date(y, m - 1, d + 6)
    const weekEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    // 每個任務本填報週的「我的報告」審核狀態：none 未填 / reviewing 審核中 / rejected 被駁回 / published 已通過(進更新紀錄)
    //   reviewing 時附帶「哪位主管、已等幾天」，讓 R 能去提醒主管審核。
    type RStat = { status: 'none' | 'reviewing' | 'rejected' | 'published'; reviewerName: string | null; waitDays: number }
    const map = new Map<string, RStat>()
    for (const group of rActiveGroups) {
      for (const task of group.tasks) {
        const logs = rReportDialogProject.taskLogs.filter(
          l => l.taskId === task.id && isSameUser(l.author, user) &&
            (l.weekOf ? l.weekOf === rReportWeekOf : (l.logDate >= weekStart && l.logDate <= weekEnd))
        )
        let status: RStat['status'] = 'none'
        let reviewerName: string | null = null
        let waitDays = 0
        if (logs.length > 0) {
          const pending = logs.filter(l => !l.publishedAt && !l.reviewerRejectedAt)
          if (pending.length > 0) {
            status = 'reviewing'
            reviewerName = pending.map(l => l.authorReviewerName).find(Boolean) ?? null
            const earliest = pending.reduce((min, l) => (l.createdAt < min ? l.createdAt : min), pending[0].createdAt)
            waitDays = Math.max(0, Math.floor((Date.now() - new Date(earliest).getTime()) / 86400000))
          } else if (logs.some(l => l.reviewerRejectedAt)) status = 'rejected'
          else status = 'published'
        }
        map.set(task.id, { status, reviewerName, waitDays })
      }
    }
    return map
  }, [rReportDialogProject, rReportWeekOf, rActiveGroups, user])

  // Prefill R log rows when task or week changes
  useEffect(() => {
    // 換任務／換週別時，過去週報回到「唯讀」預設、清除未提交旗標（重新載入既有紀錄）
    setREditPastUnlocked(false)
    setRDirty(false)
    if (!rSelectedTaskId || !rReportDialogProject) return
    const [y, m, d] = rReportWeekOf.split('-').map(Number)
    const weekStart = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const endDate = new Date(y, m - 1, d + 6)
    const weekEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    // 只載「自己」填的紀錄；別人的不自動代入。依「填報週(weekOf)」對應，舊資料無 weekOf 才退回用 logDate。
    const logs = rReportDialogProject.taskLogs
      .filter(l => l.taskId === rSelectedTaskId && isSameUser(l.author, user) &&
        (l.weekOf ? l.weekOf === rReportWeekOf : (l.logDate >= weekStart && l.logDate <= weekEnd)))
      .sort((a, b) => a.logDate.localeCompare(b.logDate))
    if (logs.length > 0) {
      setRLogRows(logs.map(l => ({
        date: l.logDate,
        content: l.content,
        existingLogId: l.id,
        attachments: l.attachments?.length ? [...l.attachments] : undefined,
        updatedAt: l.updatedAt,
        lastEditedBy: l.lastEditedBy,
        rejectedAt: l.publishedAt ? null : (l.reviewerRejectedAt ?? null),
        rejectedBy: l.reviewerRejectedBy ?? null,
        rejectNote: l.reviewerNote ?? null,
      })))
      const latestWithPlans = [...logs].reverse().find(l => l.nextPlans?.length)
      setRLogNextWeekPlan(latestWithPlans?.nextPlans?.map(p => p.content).join('\n') || '')
    } else {
      setRLogRows([{ date: '', content: '' }])
      setRLogNextWeekPlan('')
    }
  }, [rSelectedTaskId, rReportWeekOf, rReportDialogProject, user?.name])

  // 此任務本填報週的報告是否被 R 主管駁回（顯示原因，讓 R 修改重送）
  const rRejectedNote = useMemo(() => {
    if (!rSelectedTaskId || !rReportDialogProject) return null
    const [y, m, d] = rReportWeekOf.split('-').map(Number)
    const weekStart = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const endDate = new Date(y, m - 1, d + 6)
    const weekEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    const rejected = rReportDialogProject.taskLogs.find(l =>
      l.taskId === rSelectedTaskId && l.logDate >= weekStart && l.logDate <= weekEnd &&
      isSameUser(l.author, user) && l.reviewerRejectedAt)
    return rejected?.reviewerNote || null
  }, [rSelectedTaskId, rReportWeekOf, rReportDialogProject, user])

  // R dialog: select a task
  const handleRSelectTask = (taskId: string) => {
    setRSelectedTaskId(prev => prev === taskId ? null : taskId)
    setRExpandSubTab('write')
    setRChildViewTaskId(null)
    setRChildPickerOpen(false)
  }

  // 選到的任務底下所有子孫任務（含層級深度）— 有子孫才顯示「查看子層報告」分頁。
  //   情境：被指派到父層的 R 不一定是子任務的審核主管、看不到子層報告，寫父層報告易失準，故給他唯讀查看。
  const rSelectedDescendants = useMemo(() => {
    if (!rSelectedTaskId || !rReportDialogProject) return [] as { task: Task; depth: number }[]
    const childrenOf = new Map<string, Task[]>()
    for (const t of rReportDialogProject.tasks) if (t.parentId) {
      const a = childrenOf.get(t.parentId); if (a) a.push(t); else childrenOf.set(t.parentId, [t])
    }
    const out: { task: Task; depth: number }[] = []
    const walk = (id: string, depth: number) => {
      for (const c of childrenOf.get(id) || []) { out.push({ task: c, depth }); walk(c.id, depth + 1) }
    }
    walk(rSelectedTaskId, 0)
    return out
  }, [rSelectedTaskId, rReportDialogProject])

  // 選定子任務的「已進紀錄」週報，依填報週(weekOf；舊資料退回 logDate 當週)分組、新到舊。
  const rChildWeekGroups = useMemo(() => {
    if (!rChildViewTaskId || !rReportDialogProject) return [] as { key: string; monday: string; logs: TaskLog[] }[]
    const mondayOf = (d: string) => {
      const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
      const m = new Date(dt); m.setDate(diff)
      return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`
    }
    const logs = rReportDialogProject.taskLogs
      .filter(l => l.taskId === rChildViewTaskId && isReportVisible(l))
      .sort((a, b) => new Date(a.logDate).getTime() - new Date(b.logDate).getTime())
    const groups = new Map<string, { key: string; monday: string; logs: TaskLog[] }>()
    for (const l of logs) {
      const monday = l.weekOf || mondayOf(l.logDate)
      const g = groups.get(monday)
      if (g) g.logs.push(l); else groups.set(monday, { key: monday, monday, logs: [l] })
    }
    return [...groups.values()].sort((a, b) => b.monday.localeCompare(a.monday))
  }, [rChildViewTaskId, rReportDialogProject])

  // R dialog: file upload for batch log rows
  // 完成後補充：附件上傳（與週報同一支上傳 API）
  const handleRSupFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    const idx = rSupTargetIdx.current
    if (!files || files.length === 0 || idx === null) { e.target.value = ''; return }
    const fileArray = Array.from(files)
    e.target.value = ''
    setRSupUploadingIdx(idx)
    try {
      const uploaded: TaskLogAttachment[] = []
      for (const file of fileArray) uploaded.push(await uploadFile(file))
      if (uploaded.length > 0) {
        setRSupRows(prev => prev.map((r, i) => i === idx ? { ...r, attachments: [...(r.attachments || []), ...uploaded] } : r))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上傳失敗，請重試')
    } finally {
      setRSupUploadingIdx(null)
      rSupTargetIdx.current = null
    }
  }

  // 完成後補充：送出。與週報同一支 batch API，只多帶 postDoneSupplement 旗標。
  const submitRSupplement = async () => {
    if (!rSupTask || !user) return
    const entries = rSupRows
      .filter(r => r.content.trim() && r.date)
      .map(r => ({ logDate: r.date, content: r.content.trim(), attachments: r.attachments?.length ? r.attachments : undefined }))
    if (entries.length === 0) { toast.error('請至少填一列日期與內容'); return }
    setRSupSaving(true)
    try {
      const res = await fetch(`/api/projects/${rSupTask.projectId}/task-logs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: rSupTask.id, userId: user.id, weekOf: rReportWeekOf,
          entries, postDoneSupplement: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error || '送出失敗，請稍後再試'); return }
      toast.success(data?.routedTo === 'reviewer'
        ? `補充已送出，待 ${data.reviewerName || '主管'} 審核`
        : '補充已送出，待當責審核')
      setRSupTask(null)
      setRSupRows([{ date: '', content: '' }])
      const refreshRes = await fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
      if (refreshRes.ok) {
        const fresh = await refreshRes.json()
        setApiProjects(fresh.projects ?? [])
        const updated = (fresh.projects ?? []).find((p: MyTasksProject) => p.id === rSupTask.projectId)
        if (updated) setRReportDialogProject(updated)
      }
    } catch {
      toast.error('送出失敗，請稍後再試')
    } finally {
      setRSupSaving(false)
    }
  }

  const handleRRowFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    const idx = rRowTargetIdx.current
    // 沒選檔（取消選擇器）或找不到目標列 → 直接離開，不進上傳狀態（避免 spinner 卡住）
    if (!files || files.length === 0 || idx === null) { e.target.value = ''; return }
    const fileArray = Array.from(files)
    e.target.value = ''
    setRUploadingRowIdx(idx) // 確認有選檔後才進上傳中狀態
    setRUploadProgress(0)
    try {
      const uploaded: TaskLogAttachment[] = []
      let completed = 0
      for (const file of fileArray) {
        // 多檔時：整體進度 =（已完成檔數 + 當前檔進度）/ 總檔數
        const att = await uploadFile(file, p => {
          const cur = p < 0 ? 0 : p
          setRUploadProgress(Math.round(((completed + cur / 100) / fileArray.length) * 100))
        })
        uploaded.push(att)
        completed++
      }
      if (uploaded.length > 0) {
        setRLogRows(prev => prev.map((r, i) =>
          i === idx ? { ...r, attachments: [...(r.attachments || []), ...uploaded] } : r
        ))
        setRDirty(true)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上傳失敗，請重試')
    } finally {
      setRUploadingRowIdx(null)
      rRowTargetIdx.current = null
      setRUploadProgress(0)
    }
  }

  // R dialog: 刪除工作紀錄列 / 附件（含確認視窗 + 實體刪檔）
  const [rPendingDelete, setRPendingDelete] = useState<
    | { kind: 'row'; idx: number }
    | { kind: 'att'; rowIdx: number; attIdx: number }
    | null
  >(null)
  const [rDeleting, setRDeleting] = useState(false)

  const deleteUploadedFile = (url?: string) =>
    url ? fetch(`/api/upload?url=${encodeURIComponent(url)}`, { method: 'DELETE' }).catch(() => {}) : Promise.resolve()

  const refreshRReportData = async () => {
    if (!user || !rReportDialogProject) return
    const res = await fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
    if (res.ok) {
      const data = await res.json()
      setApiProjects(data.projects ?? [])
      const updated = (data.projects ?? []).find((p: MyTasksProject) => p.id === rReportDialogProject.id)
      if (updated) setRReportDialogProject(updated)
    }
  }

  const performRDelete = async () => {
    if (!rPendingDelete || !rReportDialogProject) return
    setRDeleting(true)
    try {
      if (rPendingDelete.kind === 'row') {
        const row = rLogRows[rPendingDelete.idx]
        if (row?.existingLogId) {
          await fetch(`/api/projects/${rReportDialogProject.id}/task-logs/${row.existingLogId}`, { method: 'DELETE' })
          await refreshRReportData()
        }
        await Promise.all((row?.attachments || []).map(a => deleteUploadedFile(a.url)))
        setRLogRows(prev => {
          const next = prev.filter((_, i) => i !== rPendingDelete.idx)
          return next.length > 0 ? next : [{ date: '', content: '' }]
        })
      } else {
        const { rowIdx, attIdx } = rPendingDelete
        const row = rLogRows[rowIdx]
        const removed = row?.attachments?.[attIdx]
        const newAtts = (row?.attachments || []).filter((_, i) => i !== attIdx)
        if (row?.existingLogId) {
          await fetch(`/api/projects/${rReportDialogProject.id}/task-logs/${row.existingLogId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachments: newAtts }),
          })
          await refreshRReportData()
        }
        await deleteUploadedFile(removed?.url)
        setRLogRows(prev => prev.map((r, i) =>
          i === rowIdx ? { ...r, attachments: newAtts.length ? newAtts : undefined } : r
        ))
      }
    } catch {
      // ignore
    } finally {
      setRDeleting(false)
      setRPendingDelete(null)
    }
  }

  // R dialog: batch submit logs (same API as Gantt chart)
  const handleRBatchSubmitLogs = async (confirmed = false) => {
    if (!rSelectedTaskId || !user || !rReportDialogProject) return
    const entries = rLogRows
      .filter(r => r.content.trim() && r.date)
      .map(r => ({
        logDate: r.date,
        content: r.content.trim(),
        existingLogId: r.existingLogId,
        attachments: r.attachments?.length ? r.attachments : undefined,
      }))
    if (entries.length === 0) return

    // 這週報告先前已通過審核 → 重新送出前先確認意圖（可能是誤操作）
    if (!confirmed && rTaskWeekStatus.get(rSelectedTaskId)?.status === 'published') {
      setRResubmitConfirm(true)
      return
    }

    setRSubmittingBatch(true)
    try {
      const nextPlans = rLogNextWeekPlan.trim()
        ? [{ content: rLogNextWeekPlan.trim() }]
        : []
      const res = await fetch(`/api/projects/${rReportDialogProject.id}/task-logs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: rSelectedTaskId,
          userId: user.id,
          weekOf: rReportWeekOf,            // 填報週：讓 A 依「填報週」看到 R 的報告，不是依工作日
          entries,
          ...(nextPlans.length > 0 ? { nextPlans } : {}),
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json().catch(() => ({}))
      setRDirty(false) // 已提交 → 清除未提交旗標
      const desc = data.routedTo === 'reviewer'
        ? `報告已送出，${data.reviewerName || '審核主管'} 會收到通知去審核`
        : '工作紀錄已送出，A 會收到通知'
      toast.success('週報已提交', { description: desc })
      // Refresh task data
      const refreshRes = await fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        setApiProjects(data.projects ?? [])
        // Update the dialog project reference
        const updated = (data.projects ?? []).find((p: MyTasksProject) => p.id === rReportDialogProject.id)
        if (updated) setRReportDialogProject(updated)
      }
    } catch {
      setRErrorMsg('提交失敗，請稍後再試')
    } finally {
      setRSubmittingBatch(false)
    }
  }

  // R 回報「此任務已完成／無後續」或取消回報。不改 status/progress，只設 reportedDoneAt。
  const handleToggleReportedDone = async (taskId: string, done: boolean) => {
    if (!rReportDialogProject || !user) return
    setRTogglingDone(taskId)
    try {
      const res = await fetch(`/api/projects/${rReportDialogProject.id}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedDone: done,
          reportedDoneBy: user.name,
          reviewEvent: done ? 'reported' : 'cancelled',
          reviewActor: user.name,
        }),
      })
      if (!res.ok) throw new Error()
      if (done) setRSelectedTaskId(null)
      await refreshRReportData()
    } catch {
      setRErrorMsg('操作失敗，請稍後再試。若剛更新過系統，請重新整理頁面後再試一次。')
    } finally {
      setRTogglingDone(null)
    }
  }

  // 目前展開的任務是否有「已填但尚未提交」的工作內容
  const rConfirmHasUnsaved = !!rConfirmDone && rSelectedTaskId === rConfirmDone.id && rLogRows.some(r => r.content.trim() && r.date)

  // 回報完成：若有未提交的內容，先自動提交再回報（避免使用者忘記按提交週報而遺失內容）
  const handleConfirmReportDone = async () => {
    const t = rConfirmDone
    setRConfirmDone(null)
    if (!t) return
    if (rSelectedTaskId === t.id && rLogRows.some(r => r.content.trim() && r.date)) {
      await handleRBatchSubmitLogs(true) // 先提交這次填寫的工作內容（回報完成流程本身已有確認，略過重送確認）
    }
    await handleToggleReportedDone(t.id, true)
  }

  // Open A-tab R member report dialog
  const fetchARReportData = useCallback(async (projectId: string, weekOf: string) => {
    setARReportLoading(true)
    try {
      const res = await fetch(`/api/member-weekly-reports?projectId=${projectId}&weekOf=${weekOf}`)
      if (res.ok) {
        const data = await res.json()
        setARReportData({ reports: data.reports || [], memberStatus: data.memberStatus || [] })
      }
    } catch { /* ignore */ }
    setARReportLoading(false)
  }, [])

  const openARReportDialog = async (project: MyTasksProject) => {
    setARReportProject(project)
    setARReportDialogOpen(true)
    fetchARReportData(project.id, aRReportWeekOf)
  }

  if (!user) return null

  const handleSubmitLog = async () => {
    if (!dialogTask || !logContent.trim()) return
    const content = logContent.trim()

    try {
      const res = await fetch(`/api/projects/${dialogTask.project.id}/task-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: dialogTask.task.id,
          userId: user.id,
          logDate,
          content,
          ...(attachments.length > 0 ? { attachments } : {}),
        }),
      })
      if (!res.ok) throw new Error()
      const newLog: TaskLog = await res.json()
      // Optimistic update: add the new log to local state
      setApiProjects(prev => prev.map(p =>
        p.id === dialogTask.project.id
          ? { ...p, taskLogs: [newLog, ...p.taskLogs] }
          : p
      ))
    } catch {
      // Silently fail — log will appear on next reload
    }

    setLogContent('')
    setLogContentInterim('')
    setAttachments([])
    setShowActions(true)
  }

  const handleStartEditLog = (log: TaskLog) => {
    setEditingLogId(log.id)
    setEditLogContent(log.content)
    setEditLogDate(log.logDate)
    setEditLogAttachments(log.attachments ? [...log.attachments] : [])
  }

  const handleCancelEditLog = () => {
    setEditingLogId(null)
    setEditLogContent('')
    setEditLogDate('')
    setEditLogAttachments([])
    setEditLogContentInterim('')
  }

  const handleEditFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    e.target.value = ''
    setEditUploadingFiles(true)
    setEditUploadProgress(0)
    try {
      const uploaded: TaskLogAttachment[] = []
      let completed = 0
      for (const file of fileArray) {
        const att = await uploadFile(file, p => {
          const cur = p < 0 ? 0 : p
          setEditUploadProgress(Math.round(((completed + cur / 100) / fileArray.length) * 100))
        })
        uploaded.push(att)
        completed++
      }
      if (uploaded.length > 0) setEditLogAttachments(prev => [...prev, ...uploaded])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上傳失敗，請確認網路連線')
    } finally {
      setEditUploadingFiles(false)
      setEditUploadProgress(0)
    }
  }

  const handleSaveEditLog = async (log: TaskLog) => {
    if (!dialogTask || !editLogContent.trim()) return
    try {
      const res = await fetch(`/api/projects/${log.projectId}/task-logs/${log.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editLogContent.trim(),
          logDate: editLogDate,
          attachments: editLogAttachments.length > 0 ? editLogAttachments : null,
        }),
      })
      if (!res.ok) throw new Error()
      const updated: TaskLog = await res.json()
      setApiProjects(prev => prev.map(p =>
        p.id === log.projectId
          ? { ...p, taskLogs: p.taskLogs.map(tl => tl.id === log.id ? updated : tl) }
          : p
      ))
    } catch {
      // fail silently
    }
    handleCancelEditLog()
  }

  const handleConfirmDeleteLog = async () => {
    if (!deletingLog) return
    const log = deletingLog
    setDeletingLog(null)
    try {
      const res = await fetch(`/api/projects/${log.projectId}/task-logs/${log.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      setApiProjects(prev => prev.map(p =>
        p.id === log.projectId
          ? { ...p, taskLogs: p.taskLogs.filter(tl => tl.id !== log.id) }
          : p
      ))
    } catch {
      // fail silently
    }
  }

  const handleCompleteTask = async () => {
    if (!dialogTask) return
    const { project, task } = dialogTask
    const now = new Date().toISOString().split('T')[0]
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' as const, progress: 100, completedBy: user.name, reviewEvent: 'confirmed', reviewActor: user.name }),
      })
      if (!res.ok) throw new Error()
      // Optimistic update
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              tasks: p.tasks.map(t =>
                t.id === task.id
                  ? { ...t, status: 'done' as const, progress: 100, completedAt: now, completedBy: user.name }
                  : t
              ),
            }
          : p
      ))
    } catch {
      // ignore
    }
  }

  const handleUncompleteTask = async () => {
    if (!dialogTask) return
    const { project, task } = dialogTask
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress', progress: 0 }),
      })
      if (!res.ok) throw new Error()
      // Optimistic update
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              tasks: p.tasks.map(t =>
                t.id === task.id
                  ? { ...t, status: 'in-progress' as const, progress: 0, completedAt: undefined, completedBy: undefined }
                  : t
              ),
            }
          : p
      ))
    } catch {
      // ignore
    }
  }

  // A 退回 R 的完成回報：清除 reportedDoneAt，任務回到待完成，R 可再處理
  const handleRejectReportedDone = async () => {
    if (!dialogTask) return
    const { project, task } = dialogTask
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportedDone: false, reviewEvent: 'rejected', reviewActor: user.name }),
      })
      if (!res.ok) throw new Error()
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? { ...p, tasks: p.tasks.map(t => t.id === task.id ? { ...t, reportedDoneAt: null, reportedDoneBy: null } : t) }
          : p
      ))
    } catch {
      // ignore
    }
  }

  const handleSubmitExtension = async () => {
    if (!dialogTask || !user || !extensionDate) return
    const { task, project } = dialogTask
    const milestone = project.milestones.find(m => m.id === task.milestoneId)
    if (!milestone) return

    // Compute milestone impact from task extension
    const currentTaskEnd = new Date(task.endDate)
    const proposedTaskEnd = new Date(extensionDate)
    const extraDays = Math.round((proposedTaskEnd.getTime() - currentTaskEnd.getTime()) / 86400000)
    if (extraDays <= 0) { alert('新完成日必須晚於目前截止日'); return }

    const msTasks = project.tasks.filter(t => t.milestoneId === milestone.id && !t.parentId)
    const currentTotal = msTasks.reduce((sum, t) => sum + Math.max(t.durationDays, 1), 0)
    const newTotal = currentTotal + extraDays
    const msDueDate = new Date(milestone.dueDate)
    const effectiveStart = new Date(msDueDate)
    effectiveStart.setDate(effectiveStart.getDate() - currentTotal + 1)
    const newMsEnd = new Date(effectiveStart)
    newMsEnd.setDate(newMsEnd.getDate() + newTotal - 1)
    const milestoneDelta = Math.max(0, Math.round((newMsEnd.getTime() - msDueDate.getTime()) / 86400000))
    const proposedMilestoneDate = milestoneDelta > 0
      ? newMsEnd.toISOString().split('T')[0]
      : milestone.dueDate.split('T')[0]

    try {
      const res = await fetch('/api/delay-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          requesterId: user.id,
          reason: extensionReason.trim(),
          canCatchUp: false,
          supportNeeded: extensionSupport.trim() || '',
          taskId: task.id,
          affectedMilestones: [{
            milestoneId: milestone.id,
            originalDate: milestone.dueDate,
            proposedDate: proposedMilestoneDate,
          }],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送出失敗')
      }
      // Update local state to mark milestone as pending delay
      const proposedDate = proposedMilestoneDate
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              pendingDelayMilestoneIds: [...(p.pendingDelayMilestoneIds || []), milestone.id],
              pendingDelayProposedDates: { ...(p.pendingDelayProposedDates || {}), [milestone.id]: proposedDate },
            }
          : p
      ))
      setShowExtensionForm(false)
      setShowActions(true)
      setExtensionReason('')
      setExtensionDate('')
      setExtensionSupport('')
    } catch (err) {
      alert(err instanceof Error ? err.message : '送出延期申請失敗')
    }
  }

  // Fresh task data for dialog
  const currentDialogTask = dialogTask
    ? apiProjects.find(p => p.id === dialogTask.project.id)?.tasks.find(t => t.id === dialogTask.task.id)
    : null
  const currentDialogProject = dialogTask
    ? apiProjects.find(p => p.id === dialogTask.project.id)
    : null

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">載入任務中...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">我的任務</h1>
            <button
              onClick={() => setHelpOpen(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="我的任務說明"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{user.name} 的工作總覽</p>
        </div>

        {/* 空狀態：沒有被指派任務、也沒有任何 RACI 角色的人 */}
        {availableRoles.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center text-center py-16 gap-3">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <ClipboardList className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-base font-medium">目前沒有指派給你的任務</p>
                <p className="text-sm text-muted-foreground mt-1">被指派任務或負責審核時，會顯示在這裡。</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Role-based Tabs */}
        {availableRoles.length > 0 && (
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg w-fit">
            {availableRoles.map(role => {
              const cfg = ROLE_TAB_CONFIG[role]
              const count = role === 'MY' ? myReportProjects.length
                : role === 'REVIEW' ? reviewPendingCount
                : (userRolesMap.get(role)?.length || 0)
              return (
                <button
                  key={role}
                  onClick={() => setActiveRole(role)}
                  className={cn(
                    'text-sm px-4 py-1.5 rounded-md transition-all font-medium flex items-center gap-1.5',
                    activeRole === role
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {role !== 'MY' && role !== 'REVIEW' && <span className="font-bold">{role}</span>}
                  <span>{cfg?.label || role}</span>
                  {role === 'REVIEW' && count > 0
                    ? <span className="text-[11px] px-1.5 rounded-full bg-red-500 text-white tabular-nums">{count}</span>
                    : <span className="text-xs opacity-60">{count}</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* ═══ 審查報告 Tab — 表格：專案 + 審核報告按鈕（點開對話框審核） ═══ */}
        {activeRole === 'REVIEW' && (
          reviewInbox.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">你目前不是任何成員的報告審核主管</CardContent></Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">督導成員</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">需注意</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewInbox.map(proj => {
                      const pendN = proj.reviewees.reduce((n, rv) => n + rv.pending.length, 0)
                      const chaseList = proj.reviewees.filter(rv => rv.pending.length === 0 && !rv.submittedThisWeek && rv.openTaskCount > 0)
                      const chaseN = chaseList.length
                      return (
                        <tr key={proj.projectId} className="border-b last:border-0">
                          <td className="px-4 py-3 font-medium">{proj.projectName}</td>
                          <td className="px-4 py-3 text-center text-muted-foreground">
                            {proj.reviewees.length > 0 ? (
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex items-center gap-1.5 cursor-help align-middle">
                                      <span className="flex -space-x-1.5">
                                        {proj.reviewees.slice(0, 3).map(rv => (
                                          <span key={rv.authorId} className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground ring-2 ring-background">{rv.authorName.charAt(0)}</span>
                                        ))}
                                        {proj.reviewees.length > 3 && (
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted-foreground/15 text-[10px] font-semibold text-muted-foreground ring-2 ring-background">+{proj.reviewees.length - 3}</span>
                                        )}
                                      </span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" align="center" className="p-0">
                                    <div className="max-h-56 overflow-y-auto overscroll-contain p-2 min-w-[150px]">
                                      <p className="text-[11px] font-medium text-muted-foreground px-1 pb-1">督導成員（{proj.reviewees.length}）</p>
                                      {proj.reviewees.map(rv => (
                                        <div key={rv.authorId} className="flex items-center gap-2 px-1 py-0.5 text-xs">
                                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">{rv.authorName.charAt(0)}</span>
                                          <span className="truncate">{rv.authorName}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : '0 位'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {chaseN > 0 ? (
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="destructive" className="text-xs cursor-help">{chaseN} 人未送</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" align="center" className="p-0">
                                    <div className="max-h-56 overflow-y-auto overscroll-contain p-2 min-w-[150px]">
                                      <p className="text-[11px] font-medium text-red-600 dark:text-red-400 px-1 pb-1">未送（{chaseN}）</p>
                                      {chaseList.map(rv => (
                                        <div key={rv.authorId} className="flex items-center gap-2 px-1 py-0.5 text-xs">
                                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] font-bold">{rv.authorName.charAt(0)}</span>
                                          <span className="truncate">{rv.authorName}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" variant={pendN > 0 ? 'outline' : 'ghost'}
                              className={cn('h-7 text-xs gap-1', pendN > 0 && 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400')}
                              onClick={() => setReviewDialogProjectId(proj.projectId)}>
                              <ClipboardList className="h-3 w-3" />審核報告
                              {pendN > 0 && <Badge className="h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[11px] ml-0.5">{pendN}</Badge>}
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        )}

        {/* 審核報告對話框：分頁（待審核 / 已審核）+ 點列展開完整內容 */}
        <Dialog open={!!reviewDialogProject} onOpenChange={(o) => { if (!o) { setReviewDialogProjectId(null); setSupFlowKey(null); setSupStageFilter(null) } }}>
          <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" />審核報告 — {reviewDialogProject?.projectName}</DialogTitle>
              <DialogDescription className="text-sm">點棒次篩選；點左側任一列看完整流程。</DialogDescription>
            </DialogHeader>
            {(() => {
              if (!reviewDialogProject) return null
              const pRows = reviewDialogProject.reviewees.flatMap(rv => rv.pending.map(s => ({ rv, s })))
              const rRows = reviewDialogProject.reviewees.flatMap(rv => rv.reviewed.map(s => ({ rv, s })))
                .sort((a, b) => b.s.reviewedAt.localeCompare(a.s.reviewedAt))
              const pid = reviewDialogProject.projectId
              // 必須與後端的群組鍵一字不差（含補充批次），否則點左欄選不到右欄那條鏈
              const keyOf = (authorId: string, taskId: string, weekOf: string | null, batch: string | null = null) =>
                `${pid}:${authorId}:${taskId}:${weekOf ?? '_'}:${batch ?? '_'}`
              const trackMiss = reviewDialogProject.reviewees.reduce((n, rv) => n + rv.tracking.filter(t => t.owned && !t.filled).length, 0)
              return (
                <>
                  {/* Tab bar */}
                  <div className={cn('px-5 flex gap-1 border-b', supStageFilter && 'opacity-40 pointer-events-none')}>
                    {([
                      { val: 'pending', label: '待審核', cnt: pRows.length, tone: 'amber' },
                      { val: 'reviewed', label: '已審核', cnt: rRows.length, tone: 'muted' },
                      { val: 'tracking', label: '填報追蹤', cnt: trackMiss, tone: 'red' },
                    ] as const).map(({ val, label, cnt, tone }) => (
                      <button key={val} onClick={() => {
                        setReviewDialogTab(val); setSupFlowKey(null)
                        // 待審核＝要做判斷，先看流程；已審核＝回顧內容，先看紀錄
                        setFlowTab(val === 'reviewed' ? 'logs' : 'flow')
                      }}
                        className={cn('px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
                          reviewDialogTab === val ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                        {label}
                        {cnt > 0 && <span className={cn('text-[11px] px-1.5 rounded-full tabular-nums',
                          tone === 'amber' ? 'bg-amber-500 text-white' : tone === 'red' ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground')}>{cnt}</span>}
                      </button>
                    ))}
                  </div>

                  {/* 棒次列：追人用。母體是該週的填報追蹤，所以「待 R 填報告」＝誰沒交。 */}
                  <div className="px-5 py-2.5 border-b bg-muted/20">
                    <ReviewPipelineBar
                      counts={supFlows.counts}
                      value={supStageFilter}
                      onChange={(next) => { setSupStageFilter(next); setSupFlowKey(null) }}
                      viewer="supervisor"
                    />
                  </div>

                  <div className="flex-1 flex min-h-0 overflow-hidden">
                    {/* ── 左欄：清單 ── */}
                    <div className={cn('overflow-y-auto border-r min-w-0',
                      flowPanelOpen ? 'w-[57%] shrink-0' : 'flex-1')}>
                    {supStageFilter ? (
                      /* 棒次視角：誰卡在這一棒。扁平清單即可——分組會產生「（未分類）」這種假分類。 */
                      (() => {
                        // supFlows.map 對同一個任務可能同時有 track: 與 pid:author:task:week 兩種鍵，
                        // 直接列會重複。以 taskId 去重，優先保留 track:（狀態最完整）。
                        const seen = new Map<string, { key: string; flow: ReviewFlow }>()
                        for (const [k, f] of supFlows.map) {
                          if (f.stage !== supStageFilter) continue
                          const prev = seen.get(f.taskId)
                          if (!prev || k.startsWith('track:')) seen.set(f.taskId, { key: k, flow: f })
                        }
                        const order = new Map<string, number>()
                        let oi = 0
                        for (const rv of reviewDialogProject.reviewees) {
                          for (const t of rv.tracking) if (!order.has(t.taskId)) order.set(t.taskId, oi++)
                        }
                        const rows = [...seen.values()]
                          .sort((a, b) => (order.get(a.flow.taskId) ?? 1e9) - (order.get(b.flow.taskId) ?? 1e9))
                        if (rows.length === 0) {
                          return <p className="text-sm text-muted-foreground text-center px-4 py-8">這一棒目前沒有項目</p>
                        }
                        return (
                          <div>
                            <StageLensHeader stage={supStageFilter} viewer="supervisor" count={rows.length} />
                            <div className="divide-y divide-border/60">
                            {rows.map(({ key, flow: f }) => (
                              <button key={key} type="button" onClick={() => selectSupFlow(key, 'flow')}
                                className={cn('w-full text-left px-4 py-2 transition-colors border-l-2',
                                  supFlowKey === key ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/40')}>
                                {f.path && <div className="text-[11px] text-muted-foreground truncate">{f.path}</div>}
                                <div className="text-sm font-medium truncate">{f.title}</div>
                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                  {f.assignee && (
                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                      <FlowAvatar name={f.assignee} size={16} />{f.assignee}
                                    </span>
                                  )}
                                  <StageChip stage={f.stage} viewer="supervisor" days={f.stuckDays} />
                                </div>
                              </button>
                            ))}
                            </div>
                          </div>
                        )
                      })()
                    ) : reviewDialogTab === 'tracking' ? (
                      <div className="space-y-3 px-4 py-3">
                        <div className="rounded-md border bg-muted/20 px-3 py-2.5">
                          <WeekPicker value={reviewTrackWeek} onChange={onTrackWeekChange} />
                        </div>
                        {trackMiss === 0 && (
                          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5 shrink-0" />本週督導成員皆已完成填報
                          </div>
                        )}
                        {(() => {
                          const trackReviewees = reviewDialogProject.reviewees.filter(rv => rv.tracking.length > 0)
                          if (trackReviewees.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">本週沒有需追蹤的任務</p>
                          const shown = trackPersonFilter === 'all' ? trackReviewees : trackReviewees.filter(rv => rv.authorId === trackPersonFilter)
                          return (
                          <>
                            {/* 篩選人：人少用晶片、人多改成可搜尋下拉 */}
                            {trackReviewees.length > 0 && (
                              trackReviewees.length <= 6 ? (
                                <div className="flex items-center gap-2 flex-wrap rounded-md border bg-muted/20 px-3 py-2">
                                  <span className="text-xs text-muted-foreground shrink-0">篩選人</span>
                                  <button type="button" onClick={() => setTrackPersonFilter('all')} className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors', trackPersonFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>全部（{trackReviewees.length}）</button>
                                  {trackReviewees.map(rv => { const m = rv.tracking.filter(t => t.owned && !t.filled).length; return (
                                    <button key={rv.authorId} type="button" onClick={() => setTrackPersonFilter(rv.authorId)} className={cn('inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors', trackPersonFilter === rv.authorId ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                                      {rv.authorName}{m > 0 && <span className={cn('text-[10px]', trackPersonFilter === rv.authorId ? 'opacity-90' : 'text-red-600 dark:text-red-400')}>· {m}</span>}
                                    </button>
                                  )})}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2">
                                  <span className="text-xs text-muted-foreground shrink-0">篩選人</span>
                                  <Popover open={trackPersonPickerOpen} onOpenChange={setTrackPersonPickerOpen}>
                                    <PopoverTrigger asChild>
                                      <button type="button" className="flex-1 inline-flex items-center justify-between gap-2 text-sm px-3 py-1.5 rounded-md border bg-background hover:bg-muted/50 transition-colors">
                                        <span className="truncate">
                                          {trackPersonFilter === 'all'
                                            ? `全部成員（${trackReviewees.length}）`
                                            : (trackReviewees.find(rv => rv.authorId === trackPersonFilter)?.authorName ?? '全部成員')}
                                        </span>
                                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                                      <Command>
                                        <CommandInput placeholder="搜尋成員…" className="text-sm" />
                                        <CommandList>
                                          <CommandEmpty>找不到成員</CommandEmpty>
                                          <CommandItem value="全部成員" onSelect={() => { setTrackPersonFilter('all'); setTrackPersonPickerOpen(false) }} className="text-sm">
                                            全部成員（{trackReviewees.length}）
                                          </CommandItem>
                                          {trackReviewees.map(rv => { const m = rv.tracking.filter(t => t.owned && !t.filled).length; return (
                                            <CommandItem key={rv.authorId} value={rv.authorName} onSelect={() => { setTrackPersonFilter(rv.authorId); setTrackPersonPickerOpen(false) }} className="text-sm flex items-center justify-between gap-2">
                                              <span className="truncate">{rv.authorName}</span>
                                              {m > 0 && <span className="text-[11px] text-red-600 dark:text-red-400 shrink-0">{m} 未填</span>}
                                            </CommandItem>
                                          )})}
                                        </CommandList>
                                      </Command>
                                    </PopoverContent>
                                  </Popover>
                                  {trackPersonFilter !== 'all' && (
                                    <button type="button" onClick={() => setTrackPersonFilter('all')} className="text-xs text-muted-foreground hover:text-foreground shrink-0">清除</button>
                                  )}
                                </div>
                              )
                            )}
                            {shown.map(rv => {
                          const miss = rv.tracking.filter(t => t.owned && !t.filled).length
                          const pOpen = trackExpandedPersons.has(rv.authorId)
                          return (
                            <div key={rv.authorId} className="rounded-lg border overflow-hidden">
                              {/* 依人收合展開（預設收合）*/}
                              <button type="button" onClick={() => toggleTrackPerson(rv.authorId)} className={cn('w-full flex items-center gap-2 px-3 py-2 bg-muted/30 text-left hover:bg-muted/50 transition-colors', pOpen && 'border-b')}>
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{rv.authorName.charAt(0)}</div>
                                <span className="text-sm font-medium flex-1 truncate">{rv.authorName}</span>
                                {miss > 0
                                  ? <Badge className="text-[11px] bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/30 shrink-0">{miss} 未填</Badge>
                                  : <Badge className="text-[11px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/30 shrink-0">全部已填</Badge>}
                                <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', pOpen && 'rotate-180')} />
                              </button>
                              {pOpen && (
                              <div className="divide-y">
                                {rv.tracking.map(t => {
                                  const tk = `track:${rv.authorId}:${t.taskId}`
                                  const f = supFlows.map.get(tk)
                                  return (
                                    <div key={t.taskId}>
                                      <div
                                        className={cn('flex items-center gap-2 pr-3 py-2 transition-colors border-l-2',
                                          t.owned && 'cursor-pointer',
                                          supFlowKey === tk ? 'border-l-primary bg-primary/5' : cn('border-l-transparent', t.owned && 'hover:bg-muted/40'))}
                                        style={{ paddingLeft: 12 + t.depth * 18 }}
                                        onClick={t.owned ? () => selectSupFlow(tk, 'logs') : undefined}
                                      >
                                        {t.depth > 0 && <span className="text-muted-foreground/40 text-xs select-none shrink-0">└</span>}
                                        <div className="min-w-0 flex-1">
                                          <div className={cn('text-sm truncate', !t.owned && 'text-muted-foreground')}>{t.taskTitle}</div>
                                          <div className="text-[11px] text-muted-foreground truncate">{t.depth === 0 && t.msName ? `${t.msName} · ` : ''}計畫 {t.planStart} ~ {t.planEnd}</div>
                                        </div>
                                        {!t.owned ? (
                                          <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 text-muted-foreground/60 shrink-0">上層</Badge>
                                        ) : (
                                          <>
                                            {t.overdue && !t.done && <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400 shrink-0">逾期</Badge>}
                                            {f && <StageChip stage={f.stage} viewer="supervisor" days={f.stuckDays} />}
                                          </>
                                        )}
                                        {t.owned
                                          ? <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                          : <span className="w-4 shrink-0" />}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              )}
                            </div>
                          )
                        })}
                          </>
                          )
                        })()}
                      </div>
                    ) : reviewDialogTab === 'pending' ? (
                      (() => {
                        const rows = pRows
                        if (rows.length === 0) {
                        }
                        return <>{renderSupToolbar(false)}{renderSupRows(rows, pid, keyOf, '目前沒有待審核的報告', 'flow', false)}</>
                      })()
                    ) : (
                      (() => {
                        const rows = rRows
                        if (rows.length === 0) {
                        }
                        return <>{renderSupToolbar(true)}{renderSupRows(rows, pid, keyOf, '尚無已審核的報告', 'logs', true)}</>
                      })()
                    )}
                    </div>

                    {/* ── 右欄：所選項目的完整審核流程 ── */}
                    {!flowPanelOpen && <ReviewFlowCollapsed onExpand={() => setFlowPanelOpen(true)} />}
                    {flowPanelOpen && (
                    <div className="flex-1 min-w-0 flex flex-col bg-muted/10">
                      {supSelectedFlow ? (
                        <ReviewFlowTimeline
                          key={supFlowKey}
                          className="animate-in fade-in slide-in-from-right-4 duration-200"
                          flow={supSelectedFlow}
                          viewer="supervisor"
                          tab={flowTab}
                          onTabChange={setFlowTab}
                          onCollapse={() => setFlowPanelOpen(false)}
                          logsCount={supSelectedLogs.length}
                          logs={renderReviewLogs(supSelectedLogs)}
                          chainFilter={{
                            // 同一個任務在 map 裡每條鏈各有一個鍵（追蹤／各填報週／每批補充）。
                            //   只顯示一條的話，其他條就沒有任何入口可以撤回或駁回。
                            value: supChainAll ? 'all' : (supFlowKey ?? 'all'),
                            options: [...supFlows.map.entries()]
                              .filter(([, f]) => f.taskId === supSelectedFlow.taskId)
                              .sort(([ka, fa], [kb, fb]) => {
                                // 正式報告在前，補充依送出時間由舊到新
                                if (!fa.supplement && fb.supplement) return -1
                                if (fa.supplement && !fb.supplement) return 1
                                const at = (k: string) => (supFlows.logs.get(k) ?? [])
                                  .map(l => l.createdAt ?? l.logDate).filter(Boolean).sort()[0] ?? ''
                                return at(ka).localeCompare(at(kb))
                              })
                              .map(([k, f]) => ({
                                key: k,
                                label: f.supplement
                                  ? (() => {
                                    const ls = supFlows.logs.get(k) ?? []
                                    const first = ls.map(l => l.createdAt ?? l.logDate).filter(Boolean).sort()[0]
                                    if (!first) return `補充 · 補交 · ${ls.length} 筆`
                                    const d = new Date(first)
                                    const hh = String(d.getHours()).padStart(2, '0')
                                    const mm = String(d.getMinutes()).padStart(2, '0')
                                    return `補充 · ${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} 送出 · ${ls.length} 筆`
                                  })()
                                  : `正式報告 · ${f.reportWeekLabel ?? ''}`.trim().replace(/ ·$/, ''),
                              })),
                            onChange: v => {
                              if (v === 'all') { setSupChainAll(true); return }
                              setSupChainAll(false); setSupFlowKey(v)
                            },
                          }}
                          revokeHint={
                            supSelectedFlow.supplement
                              ? (supSelectedFlow.stage === 'done'
                                ? <>補充已由當責通過並納入更新紀錄，須<b className="text-foreground">由當責先撤回</b>才能撤回核准。</>
                                : undefined)
                              : supSelectedFlow.stage === 'accountable'
                              ? <>報告已轉給當責審核，須<b className="text-foreground">由當責先駁回</b>才能撤回核准。</>
                              : supSelectedFlow.stage === 'done'
                                ? <>任務已完成，須<b className="text-foreground">由當責先撤回完成確認</b>才能撤回核准。</>
                                : supSelectedFlow.steps.some(st => st.key === 'supervisor' && st.state === 'done' && !isWithinRevokeWindow(st.at))
                                  ? <>核准已超過 {REVOKE_WINDOW_DAYS} 天，無法撤回。如需調整請與當責討論。</>
                                  : undefined
                          }
                          renderRevoke={(step) => {
                            // 撤回必須從最下游開始：球只要已經傳到當責（待 A 審核）或更後面，
                            // 主管就不能自己抽回來——要當責先駁回，球回到主管這裡才輪得到他撤。
                            if (step.key !== 'supervisor' || !supFlowKey || supSelectedFlow.legacy) return null
                            // 補充：當責還沒通過（stage=accountable）時主管仍可收回自己的核准；
                            //   一旦當責通過（done）就要他先撤。一般報告維持原本的級聯守則。
                            if (supSelectedFlow.supplement
                              ? supSelectedFlow.stage === 'done'
                              : supSelectedFlow.stage === 'accountable' || supSelectedFlow.stage === 'done') return null
                            if (!isWithinRevokeWindow(step.at)) return null
                            const src = supFlows.actionable.get(supFlowKey)
                            const parts = supFlowKey.split(':')
                            const authorId = src?.authorId ?? parts[1]
                            const weekOf = parts[3] === '_' ? null : parts[3]
                            const batch = parts[4] === '_' || parts[4] === undefined ? null : parts[4]
                            if (!authorId) return null
                            return (
                              <button type="button"
                                onClick={() => { setRevokeReason(''); setRevokeTarget({ kind: 'approval', projectId: pid, authorId, taskId: supSelectedFlow.taskId, title: supSelectedFlow.title, weekOf, batch, supplement: supSelectedFlow.supplement, as: 'reviewer', chainLabel: supSelectedFlow.supplement ? `補充 · ${supSelectedFlow.reportWeekLabel ?? ''}`.trim() : undefined }) }}
                                title="收回你在「R主管審核」做的核准：報告退回「待你審核」，不會動到當責那一棒"
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive">
                                <Undo2 className="h-3 w-3" />撤回我的核准
                              </button>
                            )
                          }}
                          actions={
                            // 這個對話框是「R主管」的身分。棒次已經交給當責時就不該再出現動作鈕——
                            //   同一個人可能同時是主管與當責（實際踩過），但那是兩個角色、兩個入口，
                            //   當責要在自己的「週報審核」裡處理，才不會分不清是以什麼身分按的。
                            supSelectedAction && supSelectedFlow.stage === 'supervisor' ? (
                            <div className="flex items-center gap-2">
                              {/* 工作紀錄預設列出整個任務（可能含別條鏈已核准的筆數），
                                  但按鈕只作用在這一批。範圍要寫出來，否則會以為是全部一起審。 */}
                              <span className="mr-auto text-[11px] text-muted-foreground">
                                將處理
                                <b className="text-foreground">
                                  {(() => {
                                  if (!supSelectedFlow.supplement) {
                                    return `正式報告${supSelectedAction.sub.weekOf ? ` · ${formatWeekLabel(supSelectedAction.sub.weekOf)}` : ''}`
                                  }
                                  const first = supSelectedAction.sub.logs
                                    .map(l => l.createdAt ?? l.logDate).filter(Boolean).sort()[0]
                                  if (!first) return '補充'
                                  const d = new Date(first)
                                  return `補充 · ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 送出`
                                })()}
                                </b>
                                {' '}的 {supSelectedAction.sub.logs.length} 筆
                              </span>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                                disabled={reviewBusy === subKey(pid, supSelectedAction.authorId, supSelectedAction.sub)}
                                onClick={() => { setRejectTarget({ projectId: pid, authorId: supSelectedAction.authorId, authorName: supSelectedAction.authorName, sub: supSelectedAction.sub }); setRejectReason('') }}>
                                <X className="h-3.5 w-3.5" />駁回
                              </Button>
                              <Button size="sm" className="h-7 text-xs gap-1"
                                disabled={reviewBusy === subKey(pid, supSelectedAction.authorId, supSelectedAction.sub)}
                                onClick={() => doReviewAction(pid, supSelectedAction.authorId, supSelectedAction.sub, 'approve')}>
                                {reviewBusy === subKey(pid, supSelectedAction.authorId, supSelectedAction.sub)
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Check className="h-3.5 w-3.5" />}通過
                              </Button>
                            </div>
                          ) : undefined}
                        />
                      ) : (
                        <div className="flex h-full min-h-0 flex-col">
                          <div className="flex justify-end border-b px-2 py-1.5 shrink-0">
                            <button type="button" onClick={() => setFlowPanelOpen(false)} title="收合右欄"
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                              <PanelRightClose className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="flex-1 min-h-0">
                            <ReviewFlowEmpty counts={supFlows.counts} viewer="supervisor" />
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                </>
              )
            })()}
          </DialogContent>
        </Dialog>

        {/* 駁回原因對話框 */}
        <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) setRejectTarget(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>駁回報告</DialogTitle>
              <DialogDescription>
                {rejectTarget && `退回「${rejectTarget.authorName}」的「${rejectTarget.sub.taskTitle}」報告，請填寫駁回原因讓成員修正。`}
              </DialogDescription>
            </DialogHeader>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="駁回原因..." rows={4} />
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRejectTarget(null)}>取消</Button>
              <Button size="sm" variant="destructive" disabled={!rejectReason.trim()}
                onClick={async () => {
                  if (!rejectTarget) return
                  const t = rejectTarget
                  setRejectTarget(null)
                  await doReviewAction(t.projectId, t.authorId, t.sub, 'reject', rejectReason.trim())
                }}>
                確認駁回
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ═══ 我的任務週報 Tab — 依「被指派任務」(不分角色) ═══ */}
        {activeRole === 'MY' && myReportProjects.length > 0 && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">我的任務</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">本週週報</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {myReportProjects.map(project => {
                    // Count user's assigned tasks (non-done milestones).
                    // 排除 A 已完成(completedAt) 與 R 已回報完成(reportedDoneAt) 的任務，才不會催填已完成的。
                    const activeMsIds = new Set(project.milestones.filter(m => m.status !== 'done').map(m => m.id))
                    const myTasks = project.tasks.filter(t => isSameUser(t.assignee, user) && activeMsIds.has(t.milestoneId) && !t.completedAt && !t.reportedDoneAt)
                    // Count tasks with logs this week
                    const [wy, wm, wd] = rReportWeekOf.split('-').map(Number)
                    const wkStart = rReportWeekOf
                    const wkEndDate = new Date(wy, wm - 1, wd + 6)
                    const wkEnd = `${wkEndDate.getFullYear()}-${String(wkEndDate.getMonth() + 1).padStart(2, '0')}-${String(wkEndDate.getDate()).padStart(2, '0')}`
                    const filledCount = myTasks.filter(t =>
                      project.taskLogs.some(l => l.taskId === t.id && l.logDate >= wkStart && l.logDate <= wkEnd)
                    ).length
                    return (
                      <tr key={project.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{project.name}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{myTasks.length} 個任務</td>
                        <td className="px-4 py-3 text-center">
                          {myTasks.length === 0 ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">無任務</Badge>
                          ) : filledCount === myTasks.length ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                              <Check className="h-3 w-3 mr-1" />全部已填
                            </Badge>
                          ) : filledCount > 0 ? (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                              {filledCount}/{myTasks.length} 已填
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">待填寫</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => openRReportDialog(project)}>
                            <FileText className="h-3 w-3" />填寫週報
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ═══ P Tab — 採購管理 (Table Layout) ═══ */}
        {activeRole === 'P' && pProjects.length > 0 && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">預算項目</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">資本支出項目</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">預估金額</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pProjects.map(project => {
                    const data = procurementData[project.id]
                    const budgetItems = data?.budgetItems || []
                    const capexItems = data?.capexItems || []
                    const isLoading = data?.loading ?? true
                    const totalEstimated = budgetItems.reduce((sum: number, b: any) => sum + (b.estimatedCost || 0), 0)

                    return (
                      <tr key={project.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{project.name}</td>
                        <td className="px-4 py-3 text-center">
                          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : budgetItems.length}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : capexItems.length}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {isLoading ? '-' : totalEstimated > 0 ? `$${totalEstimated.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                            <a href={`/projects/${project.id}?tab=capex`}>
                              <ArrowRight className="h-3 w-3" />採購管理
                            </a>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ═══ S Tab — 審核 (Table Layout) ═══ */}
        {activeRole === 'S' && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {roleProjects.map(project => (
                    <tr key={project.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{project.name}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                          <a href={`/projects/${project.id}`}>查看專案</a>
                        </Button>
                        <Button size="sm" variant="default" className="h-7 text-xs" asChild>
                          <a href="/approvals">前往審核中心</a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ═══ C/I Tabs — View-only (Table Layout) ═══ */}
        {(activeRole === 'C' || activeRole === 'I') && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {roleProjects.map(project => (
                    <tr key={project.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{project.name}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                          <a href={`/projects/${project.id}`}>查看專案</a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ═══ A Tab — 當責/PM 管理 (Table Layout) ═══ */}
        {activeRole === 'A' && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">任務進度</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">需注意</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">R 成員週報</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map(({ project, milestoneGroups, completedCount: pCompleted, totalCount: pTotal }) => {
                    const pAtRisk = milestoneGroups.flatMap(m => m.tasks.filter(t => {
                      const s = computeTaskStatus(t, project.taskLogs)
                      return s === 'at-risk' || s === 'overdue' || s === 'overdue-not-started'
                    })).length

                    return (
                      <tr key={project.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{project.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{milestoneGroups.length} 個里程碑</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-medium">{pCompleted}</span>
                          <span className="text-muted-foreground">/{pTotal}</span>
                          <span className={cn('ml-1.5 text-xs', pTotal > 0 && pCompleted === pTotal ? 'text-green-600' : 'text-muted-foreground')}>
                            ({pTotal > 0 ? Math.round((pCompleted / pTotal) * 100) : 0}%)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {pAtRisk > 0 ? (
                            <Badge variant="destructive" className="text-xs">{pAtRisk}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const pendN = reviewPendingItems.filter(i => i.projectId === project.id).length
                            return (
                              <Button size="sm" variant={pendN > 0 ? 'outline' : 'ghost'} className={cn('h-7 text-xs gap-1', pendN > 0 && 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400')} onClick={() => openReviewForProject(project.id)}>
                                <ClipboardList className="h-3 w-3" />審核 R 週報
                                {pendN > 0 && <Badge className="h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[11px] ml-0.5">{pendN}</Badge>}
                              </Button>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                            <a href={`/projects/${project.id}`}>
                              <ArrowRight className="h-3 w-3" />甘特圖
                            </a>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Task Dialog — Tab-based */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) setShowExtensionForm(false)
      }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          {!currentDialogTask && <DialogTitle className="sr-only">任務</DialogTitle>}
          {currentDialogTask && currentDialogProject && (() => {
            const task = currentDialogTask
            const project = currentDialogProject
            const status = computeTaskStatus(task, project.taskLogs)
            const days = getDaysUntilDeadline(task)
            const isCompleted = !!task.completedAt
            const milestone = project.milestones.find(m => m.id === task.milestoneId)
            const taskLogs = project.taskLogs
              .filter(l => l.taskId === task.id)
              .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())

            // Dependency analysis
            const upstreamTasks = task.dependencies
              .map(depId => {
                const depTask = project.tasks.find(t => t.id === depId)
                if (!depTask) return null
                return { task: depTask, status: computeTaskStatus(depTask, project.taskLogs) }
              })
              .filter(Boolean) as { task: Task; status: ComputedTaskStatus }[]

            const downstreamTasks = project.tasks
              .filter(t => t.dependencies.includes(task.id))
              .map(t => ({ task: t, status: computeTaskStatus(t, project.taskLogs) }))

            const hasBlockedUpstream = upstreamTasks.some(u => u.status !== 'completed')

            // Check if this task's milestone has a pending delay request
            const hasPendingDelay = (project.pendingDelayMilestoneIds || []).includes(task.milestoneId)
            const pendingProposedDate = (project.pendingDelayProposedDates || {})[task.milestoneId]

            // Badge text with days info
            const badgeText = (() => {
              if (isCompleted) return '已完成'
              if (hasPendingDelay && (status === 'overdue' || status === 'overdue-not-started')) return '延期申請中'
              if (status === 'overdue') return `逾期${Math.abs(days)}天`
              if (status === 'at-risk') return `剩${days}天`
              return getStatusLabel(status)
            })()

            return (
              <>
                {/* Header */}
                <div className="px-6 pt-5 pb-3">
                  <DialogHeader>
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        isCompleted ? 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400' :
                        hasPendingDelay && (status === 'overdue' || status === 'overdue-not-started') ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' :
                        status === 'overdue' ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' :
                        status === 'overdue-not-started' ? 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' :
                        status === 'at-risk' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' :
                        'bg-primary/10 text-primary'
                      )}>
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> :
                         hasPendingDelay && (status === 'overdue' || status === 'overdue-not-started') ? <Clock className="h-5 w-5" /> :
                         status === 'overdue' ? <AlertTriangle className="h-5 w-5" /> :
                         status === 'overdue-not-started' ? <AlertTriangle className="h-5 w-5" /> :
                         status === 'at-risk' ? <AlertCircle className="h-5 w-5" /> :
                         <ListChecks className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <DialogTitle className={cn('text-base text-left leading-tight', isCompleted && 'text-muted-foreground')}>
                            {task.title}
                          </DialogTitle>
                          <Badge className={cn('text-xs px-2 py-0.5 shrink-0',
                            hasPendingDelay && (status === 'overdue' || status === 'overdue-not-started')
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                              : getStatusColor(status)
                          )}>
                            {badgeText}
                          </Badge>
                        </div>
                        <DialogDescription className="text-left text-sm">
                          <span className="text-muted-foreground">{project.name}</span>
                          {milestone && <span className="text-muted-foreground"> · {milestone.name}</span>}
                          <span className="text-muted-foreground"> · </span>
                          <span className="font-mono text-muted-foreground/80">
                            {new Date(task.startDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                            {' ~ '}
                            {new Date(task.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                          </span>
                        </DialogDescription>
                        {hasBlockedUpstream && (
                          <div className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400">
                            <div className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" />
                            前置任務尚未完成
                          </div>
                        )}
                        {hasPendingDelay && pendingProposedDate && (
                          <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                            <div className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                            已申請延期至 {new Date(pendingProposedDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}（等待審核）
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogHeader>
                </div>

                {/* Hidden file inputs */}
                <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
                <input ref={fileInputRef} type="file" multiple className="hidden" accept=".xls,.xlsx,.csv,.ppt,.pptx,.doc,.docx,.txt,.md,.pdf,.zip,.rar,.7z" onChange={handleFileSelect} />

                {/* 3 Tabs — hidden when extension form is open */}
                {!showExtensionForm && <Tabs defaultValue="log" className="flex-1 flex flex-col min-h-0">
                  <div className="px-6 pt-1 pb-0 border-b">
                    <TabsList className="w-full bg-transparent h-auto p-0 rounded-none gap-0">
                      <TabsTrigger value="log" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2.5 pt-2 text-sm">
                        工作紀錄
                      </TabsTrigger>
                      <TabsTrigger value="history" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2.5 pt-2 text-sm">
                        過往紀錄
                        {taskLogs.length > 0 && (
                          <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[11px] rounded-full">
                            {taskLogs.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="info" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2.5 pt-2 text-sm">
                        任務資訊
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Tab: 工作紀錄 — input form + two-step flow */}
                  <TabsContent value="log" className="flex-1 overflow-y-auto px-6 mt-0">
                    <div className="py-4 space-y-4">
                      {isCompleted ? (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-100 dark:bg-green-950/20 dark:border-green-900">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-green-700 dark:text-green-400">此任務已完成</p>
                            {task.completedAt && (
                              <p className="text-sm text-green-600/70 dark:text-green-400/70 mt-0.5">
                                完成於 {new Date(task.completedAt).toLocaleDateString('zh-TW')}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : !showActions ? (
                        /* Step 1: Input form */
                        showExtensionForm ? (
                          /* When extension form is open, hide input area */
                          null
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">填寫日期</span>
                              <input
                                type="date"
                                value={logDate}
                                onChange={e => setLogDate(e.target.value)}
                                className="text-sm border rounded-lg px-2.5 py-1.5 bg-background"
                              />
                            </div>

                            {/* Editable chat-style input box */}
                            <>
                              <div className={cn(
                                'rounded-xl border bg-muted/30 transition-colors overflow-hidden',
                                'border-muted-foreground/20 focus-within:border-primary/40 focus-within:bg-background'
                              )}>
                                {/* Import subtask logs button — only for parent tasks with subtasks */}
                                {(task.subtasks || []).length > 0 && (
                                  <div className="flex justify-end px-3 pt-2">
                                    <Popover open={importSubLogsOpen} onOpenChange={setImportSubLogsOpen}>
                                      <PopoverTrigger asChild>
                                        <button
                                          type="button"
                                          className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
                                        >
                                          <FileText className="h-3 w-3" />
                                          帶入子任務紀錄
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent align="end" className="w-52 p-1.5">
                                        <button
                                          onClick={handleImportSubLogsRaw}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left"
                                        >
                                          <FileText className="h-4 w-4 text-muted-foreground" />
                                          原始資料
                                        </button>
                                        <button
                                          onClick={handleImportSubLogsAI}
                                          disabled={importSubLogsLoading}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left disabled:opacity-50"
                                        >
                                          {importSubLogsLoading
                                            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            : <Sparkles className="h-4 w-4 text-amber-500" />
                                          }
                                          AI 彙整
                                        </button>
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                )}
                                <Textarea
                                  placeholder="描述您今天做了什麼..."
                                  value={logContent + (logContentInterim ? (logContent ? ' ' : '') + logContentInterim : '')}
                                  onChange={e => { setLogContent(e.target.value); setLogContentInterim('') }}
                                  rows={3}
                                  className="text-sm resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 rounded-none"
                                />

                                {/* Attachments inside box */}
                                {attachments.length > 0 && (
                                  <div className="px-3 pb-2 space-y-1.5">
                                    {attachments.filter(a => a.type === 'image').length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {attachments.filter(a => a.type === 'image').map((att) => (
                                          <div key={att.url} className="relative group/img">
                                            <img src={att.url} alt={att.name} className="h-14 w-14 object-cover rounded-lg border border-border" />
                                            <button
                                              onClick={() => setAttachments(prev => prev.filter(a => a.url !== att.url))}
                                              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-destructive flex items-center justify-center"
                                            >
                                              <X className="h-2.5 w-2.5" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {attachments.filter(a => a.type === 'file').length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {attachments.filter(a => a.type === 'file').map((att) => (
                                          <div key={att.url} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border border-border/70 bg-muted/50 text-xs">
                                            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                                            <span className="max-w-[120px] truncate">{att.name}</span>
                                            <button
                                              onClick={() => setAttachments(prev => prev.filter(a => a.url !== att.url))}
                                              className="ml-0.5 text-muted-foreground hover:text-destructive"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Toolbar inside box */}
                                <div className="flex items-center justify-between px-2 py-1.5 border-t border-border/40">
                                  <div className="flex items-center gap-0.5">
                                    <VoiceInputButton
                                      className="h-7 w-7"
                                      onTranscript={(text) => { setLogContent(prev => prev ? `${prev} ${text}` : text); setLogContentInterim('') }}
                                      onInterimTranscript={setLogContentInterim}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => imageInputRef.current?.click()}
                                      disabled={uploadingFiles}
                                      className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                                      title="上傳圖片"
                                    >
                                      <ImagePlus className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => fileInputRef.current?.click()}
                                      disabled={uploadingFiles}
                                      className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                                      title="上傳檔案"
                                    >
                                      <Paperclip className="h-4 w-4" />
                                    </button>
                                    {uploadingFiles && (
                                      <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {uploadProgress > 0 && <span className="tabular-nums">{uploadProgress}%</span>}
                                      </span>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    className="gap-1.5 rounded-lg shadow-sm h-7 px-3 text-sm"
                                    disabled={!logContent.trim()}
                                    onClick={handleSubmitLog}
                                  >
                                    <Send className="h-3 w-3" />
                                    提交
                                  </Button>
                                </div>
                              </div>

                              {/* Skip button */}
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="gap-1.5 text-sm"
                                  onClick={() => setShowActions(true)}
                                >
                                  跳過，直接操作
                                  <ArrowRight className="h-3 w-3" />
                                </Button>
                              </div>
                            </>
                          </>
                        )
                      ) : (
                        /* Step 2: Action buttons (after submit/skip) */
                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
                          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>紀錄已提交，請選擇下一步操作</span>
                          </div>

                          {/* R 已回報完成、待 A 審視（A 可「標記完成」正式結案，或「退回」讓 R 再處理） */}
                          {task.reportedDoneAt && !isCompleted && (
                            <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 space-y-2">
                              <div className="flex items-start gap-2">
                                <UserCheck className="h-4 w-4 shrink-0 mt-0.5" />
                                <div className="text-xs leading-relaxed">
                                  <span className="font-medium">{task.reportedDoneBy || '執行者'} 回報此任務已完成／無後續</span>
                                  （{new Date(task.reportedDoneAt).toLocaleDateString('zh-TW')}）。請「標記完成」正式結案，或「退回」讓對方再處理。
                                </div>
                              </div>
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
                                  onClick={handleRejectReportedDone}
                                >
                                  <Undo2 className="h-3 w-3" />退回（重新處理）
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              className="group flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-left"
                              onClick={handleCompleteTask}
                            >
                              <CircleCheck className="h-5 w-5 shrink-0 text-primary" />
                              <div>
                                <p className="text-sm font-medium">標記完成</p>
                                <p className="text-[11px] text-muted-foreground">已完成所有工作</p>
                              </div>
                            </button>

                            {(status === 'at-risk' || status === 'overdue' || status === 'overdue-not-started') ? (
                              hasPendingDelay ? (
                                <div
                                  className="flex items-center gap-3 p-3 rounded-xl border border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20 text-left opacity-70"
                                >
                                  <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                                  <div>
                                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">延期申請中</p>
                                    <p className="text-[11px] text-muted-foreground">等待主管審核</p>
                                  </div>
                                </div>
                              ) : (
                              <button
                                className="group flex items-center gap-3 p-3 rounded-xl border border-amber-300 bg-amber-50/50 hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 transition-all text-left"
                                onClick={() => {
                                  // Pre-fill with task end date + 7 days
                                  if (dialogTask) {
                                    const d = new Date(dialogTask.task.endDate)
                                    d.setDate(d.getDate() + 7)
                                    setExtensionDate(d.toISOString().split('T')[0])
                                  }
                                  setShowActions(false)
                                  setShowExtensionForm(true)
                                }}
                              >
                                <CalendarClock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                                <div>
                                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">申請延期</p>
                                  <p className="text-[11px] text-muted-foreground">需要更多時間</p>
                                </div>
                              </button>
                              )
                            ) : (
                              <button
                                className="group flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-all text-left"
                                onClick={() => setDialogOpen(false)}
                              >
                                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                                <div>
                                  <p className="text-sm font-medium">完成回報</p>
                                  <p className="text-[11px] text-muted-foreground">關閉此視窗</p>
                                </div>
                              </button>
                            )}
                          </div>

                          <button
                            className="text-sm text-muted-foreground hover:text-foreground w-full text-center py-1 transition-colors"
                            onClick={() => setShowActions(false)}
                          >
                            <ArrowLeft className="h-3 w-3 inline mr-1" />
                            返回繼續填寫
                          </button>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* Tab: 過往紀錄 */}
                  <TabsContent value="history" className="flex-1 px-4 mt-0 overflow-y-auto">
                    {taskLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                          <Clock className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">尚無工作紀錄</p>
                        <p className="text-sm text-muted-foreground/60 mt-1">提交第一筆紀錄後會顯示在這裡</p>
                      </div>
                    ) : (
                      <div className="py-4 space-y-3">
                        {taskLogs.map((log) => (
                          <div key={log.id} className="group rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                            {editingLogId === log.id ? (
                              /* ── Edit mode ── */
                              <div>
                                <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/20 bg-primary/5 rounded-t-xl">
                                  <Pencil className="h-3.5 w-3.5 text-primary" />
                                  <span className="text-sm font-medium text-primary">編輯紀錄</span>
                                  <input
                                    type="date"
                                    value={editLogDate}
                                    onChange={e => setEditLogDate(e.target.value)}
                                    className="ml-auto h-7 text-xs border rounded px-2 bg-background"
                                  />
                                </div>
                                <div className="px-4 py-3 space-y-3">
                                  {/* Textarea with toolbar (same style as new-log input) */}
                                  <div className={cn(
                                    'rounded-xl border bg-muted/30 transition-colors overflow-hidden',
                                    'border-muted-foreground/20 focus-within:border-primary/40 focus-within:bg-background'
                                  )}>
                                    <Textarea
                                      value={editLogContent + (editLogContentInterim ? (editLogContent ? ' ' : '') + editLogContentInterim : '')}
                                      onChange={e => { setEditLogContent(e.target.value); setEditLogContentInterim('') }}
                                      className="text-sm min-h-[80px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 rounded-none"
                                      placeholder="工作內容"
                                    />
                                    {/* Attachment previews below textarea */}
                                    {editLogAttachments.length > 0 && (
                                      <div className="px-3 pb-2 space-y-1.5">
                                        {editLogAttachments.filter(a => a.type === 'image').length > 0 && (
                                          <div className="flex flex-wrap gap-1.5">
                                            {editLogAttachments.filter(a => a.type === 'image').map((att) => (
                                              <div key={att.url} className="relative group/img">
                                                <img src={att.url} alt={att.name} className="h-14 w-14 object-cover rounded-lg border border-border" />
                                                <button
                                                  onClick={() => setEditLogAttachments(prev => prev.filter(a => a.url !== att.url))}
                                                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-destructive flex items-center justify-center"
                                                >
                                                  <X className="h-2.5 w-2.5" />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {editLogAttachments.filter(a => a.type === 'file').length > 0 && (
                                          <div className="flex flex-wrap gap-1.5">
                                            {editLogAttachments.filter(a => a.type === 'file').map((att) => (
                                              <div key={att.url} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border border-border/70 bg-background text-xs">
                                                <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                                                <span className="max-w-[120px] truncate">{att.name}</span>
                                                <button
                                                  onClick={() => setEditLogAttachments(prev => prev.filter(a => a.url !== att.url))}
                                                  className="ml-0.5 text-muted-foreground hover:text-destructive"
                                                >
                                                  <X className="h-3 w-3" />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {/* Toolbar */}
                                    <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-border/40">
                                      <VoiceInputButton
                                        className="h-7 w-7"
                                        onTranscript={(text) => { setEditLogContent(prev => prev ? `${prev} ${text}` : text); setEditLogContentInterim('') }}
                                        onInterimTranscript={setEditLogContentInterim}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => editImageInputRef.current?.click()}
                                        disabled={editUploadingFiles}
                                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                                        title="上傳圖片"
                                      >
                                        <ImagePlus className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => editFileInputRef.current?.click()}
                                        disabled={editUploadingFiles}
                                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                                        title="上傳檔案"
                                      >
                                        <Paperclip className="h-4 w-4" />
                                      </button>
                                      {editUploadingFiles && (
                                        <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          {editUploadProgress > 0 && <span className="tabular-nums">{editUploadProgress}%</span>}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <input ref={editImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleEditFileSelect} />
                                  <input ref={editFileInputRef} type="file" multiple className="hidden" accept=".xls,.xlsx,.csv,.ppt,.pptx,.doc,.docx,.txt,.md,.pdf,.zip,.rar,.7z" onChange={handleEditFileSelect} />
                                  {/* Save / cancel */}
                                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/40">
                                    <Button size="sm" variant="ghost" className="h-7 px-3 text-sm" onClick={handleCancelEditLog}>
                                      <X className="h-3.5 w-3.5 mr-1" />取消
                                    </Button>
                                    <Button size="sm" className="h-7 px-3 text-sm" disabled={!editLogContent.trim()} onClick={() => handleSaveEditLog(log)}>
                                      <Check className="h-3.5 w-3.5 mr-1" />儲存
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* ── Display mode ── */
                              <>
                                {/* Card header */}
                                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/40">
                                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <span className="text-[11px] font-semibold text-primary">
                                      {log.author.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </span>
                                  </div>
                                  <span className="flex-1 text-sm font-medium">{log.author}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isSameUser(log.author, user) && (
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                          onClick={() => handleStartEditLog(log)}
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                          onClick={() => setDeletingLog(log)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(log.logDate).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                </div>
                                {/* Card body */}
                                <div className="px-4 py-3 space-y-3">
                                  <p className="text-sm leading-relaxed">{log.content}</p>
                                  {log.attachments && log.attachments.filter(a => a.type === 'image').length > 0 && (
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {log.attachments.filter(a => a.type === 'image').map((att, ai) => (
                                        <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer"
                                          className="block overflow-hidden rounded-lg border border-border/50 hover:opacity-90 transition-opacity">
                                          <img src={att.url} alt={att.name} className="aspect-video w-full object-cover" />
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  {log.attachments && log.attachments.filter(a => a.type === 'file').length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {log.attachments.filter(a => a.type === 'file').map((att, ai) => (
                                        <a key={ai} href={att.url} download={att.name} target="_blank" rel="noopener noreferrer"
                                          className="flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-lg border border-border/60 bg-muted/40 text-xs text-foreground hover:bg-muted transition-colors">
                                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                          <span className="max-w-[140px] truncate">{att.name}</span>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Tab: 任務資訊 */}
                  <TabsContent value="info" className="flex-1 overflow-y-auto px-6 mt-0">
                    <div className="space-y-4 py-4">
                      {task.description && (
                        <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                          <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
                        </div>
                      )}

                      {upstreamTasks.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                              <ArrowLeft className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            </div>
                            <span className="text-sm font-medium text-muted-foreground">前置任務</span>
                          </div>
                          <div className="space-y-1.5 ml-7">
                            {upstreamTasks.map(({ task: dep, status: depStatus }) => (
                              <div key={dep.id} className="flex items-center gap-2.5 text-sm py-2 px-3 rounded-lg bg-muted/30 border border-border/50">
                                {getStatusDot(depStatus)}
                                <span className="flex-1 truncate">{dep.title}</span>
                                {getStatusBadge(depStatus)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {downstreamTasks.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                              <ArrowRight className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                            </div>
                            <span className="text-sm font-medium text-muted-foreground">後續任務</span>
                          </div>
                          <div className="space-y-1.5 ml-7">
                            {downstreamTasks.map(({ task: dep, status: depStatus }) => (
                              <div key={dep.id} className="flex items-center gap-2.5 text-sm py-2 px-3 rounded-lg bg-muted/30 border border-border/50">
                                {getStatusDot(depStatus)}
                                <span className="flex-1 truncate">{dep.title}</span>
                                {getStatusBadge(depStatus)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {upstreamTasks.length === 0 && downstreamTasks.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            <Info className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">此任務無上下游依賴關係</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>}

                {/* Extension Form (expandable) */}
                {showExtensionForm && (
                  <div className="px-6 py-4 border-t bg-amber-50/30 dark:bg-amber-950/10 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                        <CalendarClock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <span className="text-sm font-medium">申請延期</span>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">延遲原因 <span className="text-red-500">*</span></Label>
                      <Textarea
                        placeholder="說明延遲的原因..."
                        value={extensionReason}
                        onChange={e => setExtensionReason(e.target.value)}
                        rows={2}
                        className="text-sm mt-1.5 rounded-lg"
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">任務預計完成日 <span className="text-red-500">*</span></Label>
                      <input
                        type="date"
                        value={extensionDate}
                        min={dialogTask ? (() => { const d = new Date(dialogTask.task.endDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })() : undefined}
                        onChange={e => setExtensionDate(e.target.value)}
                        className="w-full text-sm border rounded-lg px-2.5 py-1.5 mt-1.5 bg-background"
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">需要協助</Label>
                      <Textarea
                        placeholder="選填，說明是否需要額外資源或支援..."
                        value={extensionSupport}
                        onChange={e => setExtensionSupport(e.target.value)}
                        rows={2}
                        className="text-sm mt-1.5 rounded-lg"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 rounded-lg"
                        onClick={() => {
                          setShowExtensionForm(false)
                          setShowActions(true)
                        }}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        取消
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5 flex-1 rounded-lg shadow-sm"
                        disabled={!extensionReason.trim() || !extensionDate}
                        onClick={handleSubmitExtension}
                      >
                        <Send className="h-3.5 w-3.5" />
                        送出延期申請
                      </Button>
                    </div>
                  </div>
                )}

                {/* Bottom bar: only for completed tasks (undo) */}
                {isCompleted && (
                  <div className="px-6 py-3 border-t flex items-center bg-muted/20">
                    <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={handleUncompleteTask}>
                      <Undo2 className="h-3.5 w-3.5" />
                      取消完成
                    </Button>
                  </div>
                )}
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* 完成後補充：執行者對已完成任務補交紀錄。走完整審核，但不動完成日與進度。 */}
      <Dialog open={!!rSupTask} onOpenChange={open => { if (!open && !rSupSaving) { setRSupTask(null); setRSupRows([{ date: '', content: '' }]) } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">完成後補充 — {rSupTask?.title}</DialogTitle>
            <DialogDescription className="text-xs">
              補交這個任務當時的紀錄或文件。日期可填完成日之前或之後，
              <b className="text-foreground">不會改變任務的完成日與甘特進度</b>。
              送出後與一般週報走同一條審核：主管核准即納入更新紀錄。
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/40">
                  <th className="w-[130px] border-b px-2 py-1.5 text-left text-[11px] font-medium text-muted-foreground">日期</th>
                  <th className="border-b px-2 py-1.5 text-left text-[11px] font-medium text-muted-foreground">補充內容</th>
                  <th className="w-[40px] border-b px-1 py-1.5 text-center text-[11px] font-medium text-muted-foreground">附件</th>
                  <th className="w-[28px] border-b"></th>
                </tr>
              </thead>
              <tbody>
                {rSupRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-1.5 align-top">
                      <input type="date" value={row.date}
                        className="h-8 w-full rounded border bg-background px-2 text-xs"
                        onChange={e => setRSupRows(prev => prev.map((r, i) => i === idx ? { ...r, date: e.target.value } : r))} />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <Textarea rows={2} placeholder="補充內容..." value={row.content} className="min-h-[38px] text-xs"
                        onChange={e => setRSupRows(prev => prev.map((r, i) => i === idx ? { ...r, content: e.target.value } : r))} />
                      {!!row.attachments?.length && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.attachments.map((att, ai) => (
                            <span key={ai} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">
                              <Paperclip className="h-3 w-3 text-muted-foreground" />
                              <span className="max-w-[140px] truncate">{att.name}</span>
                              <button type="button" className="text-muted-foreground hover:text-destructive"
                                onClick={() => setRSupRows(prev => prev.map((r, i) => i === idx
                                  ? { ...r, attachments: (r.attachments || []).filter((_, k) => k !== ai) } : r))}>
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-1 py-1.5 text-center align-top">
                      <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
                        disabled={rSupUploadingIdx !== null}
                        onClick={() => { rSupTargetIdx.current = idx; rSupFileRef.current?.click() }}>
                        {rSupUploadingIdx === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                    <td className="px-1 py-1.5 text-center align-top">
                      {rSupRows.length > 1 && (
                        <button type="button" className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                          onClick={() => setRSupRows(prev => prev.filter((_, i) => i !== idx))}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <input ref={rSupFileRef} type="file" multiple className="hidden" onChange={handleRSupFileSelect} />
            <button type="button"
              className="w-full border-t border-dashed border-primary/20 py-2 text-xs text-primary transition-colors hover:bg-primary/5"
              onClick={() => setRSupRows(prev => [...prev, { date: '', content: '' }])}>
              + 新增一列
            </button>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={rSupSaving}
              onClick={() => { setRSupTask(null); setRSupRows([{ date: '', content: '' }]) }}>取消</Button>
            <Button disabled={rSupSaving || rSupUploadingIdx !== null} onClick={submitRSupplement}>
              {rSupSaving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />送出中...</> : <><Send className="mr-1.5 h-3.5 w-3.5" />送出補充</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete task log confirmation */}
      <AlertDialog open={!!deletingLog} onOpenChange={open => { if (!open) setDeletingLog(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除工作紀錄</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除這筆工作紀錄嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletingLog && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">
              {deletingLog.content}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDeleteLog}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 刪除 R 週報填寫中的工作紀錄列 / 附件確認 */}
      <AlertDialog open={!!rPendingDelete} onOpenChange={open => { if (!open && !rDeleting) setRPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{rPendingDelete?.kind === 'att' ? '確認刪除附件' : '確認刪除工作紀錄'}</AlertDialogTitle>
            <AlertDialogDescription>
              {rPendingDelete?.kind === 'att'
                ? '確定要刪除這個附件嗎？此操作無法復原。'
                : '確定要刪除這筆工作紀錄嗎？此操作無法復原。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={rDeleting}
              onClick={(e) => { e.preventDefault(); performRDelete() }}
            >
              {rDeleting ? '刪除中…' : '刪除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Milestone Date Change Dialog ── */}
      <Dialog open={msDateDialogOpen} onOpenChange={open => { if (!open) { setMsDateDialogOpen(false); setMsDateDialogData(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              提出里程碑延期申請
            </DialogTitle>
            <DialogDescription>
              調整里程碑預定完成日期，送出後需經主管審核才會生效。
            </DialogDescription>
          </DialogHeader>
          {msDateDialogData && (() => {
            const { milestoneName, projectName, currentStartDate, currentDueDate, proposedDate, nextMilestoneDueDate, nextMilestoneName } = msDateDialogData
            const shift = dayDiff(currentDueDate, proposedDate)
            const willAffectNext = nextMilestoneDueDate
              ? new Date(proposedDate) >= new Date(nextMilestoneDueDate)
              : false
            const isNoChange = proposedDate === currentDueDate
            const isEarlier = shift < 0

            return (
              <div className="space-y-4">
                {/* Info section */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">專案</span>
                    <span className="font-medium">{projectName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">里程碑</span>
                    <span className="font-medium">{milestoneName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">目前區間</span>
                    <span className="font-mono text-xs">{currentStartDate} ~ {currentDueDate}</span>
                  </div>
                </div>

                {/* Date picker */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">新的預定完成日</Label>
                  <input
                    type="date"
                    value={proposedDate}
                    min={currentStartDate}
                    onChange={e => setMsDateDialogData(prev => prev ? { ...prev, proposedDate: e.target.value } : prev)}
                    className="w-full h-9 text-sm border rounded-md px-3 bg-background"
                  />
                </div>

                {/* Shift info */}
                {!isNoChange && (
                  <div className={cn(
                    'rounded-lg border p-3 space-y-1.5',
                    isEarlier ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
                  )}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {isEarlier ? (
                        <ArrowLeft className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-amber-600" />
                      )}
                      <span className={isEarlier ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}>
                        {isEarlier ? `提前 ${Math.abs(shift)} 天` : `延後 ${shift} 天`}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {currentDueDate} <ArrowRight className="inline h-3 w-3 mx-0.5" /> {proposedDate}
                    </div>
                  </div>
                )}

                {/* Impact warning */}
                {willAffectNext && !isNoChange && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">將影響後續里程碑</p>
                        <p className="text-xs text-red-600/80 dark:text-red-400/70">
                          新的完成日已超過下一個里程碑「{nextMilestoneName}」的預定日（{nextMilestoneDueDate}），
                          審核通過後系統將自動順延後續里程碑與任務日期。
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {!willAffectNext && !isNoChange && shift > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 p-3">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-600/80 dark:text-blue-400/70">
                        此延期不會影響後續里程碑，僅調整本里程碑的預定完成日。
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => { setMsDateDialogOpen(false); setMsDateDialogData(null) }}
                  >
                    取消
                  </Button>
                  <Button
                    disabled={isNoChange}
                    onClick={handleMilestoneDateChange}
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    送出延期申請
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ── R Tab: Weekly Report Dialog (Task-based, matching Gantt chart design) ── */}
      <Dialog open={rReportDialogOpen} onOpenChange={(open) => {
        // 關閉時若有填寫但未提交 → 先跳確認，避免資料消失
        if (!open && rDirty) { setRConfirmClose(true); return }
        if (!open) { closeRReportDialog(); return }
        setRReportDialogOpen(open)
      }}>
        <DialogContent className={cn('max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden transition-[max-width] duration-200',
          rFlowPanelOpen ? 'sm:max-w-5xl' : 'sm:max-w-2xl')}>
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="text-base">填寫週報</DialogTitle>
            {rReportDialogProject && (
              <DialogDescription className="text-sm">
                {rReportDialogProject.name} — 選擇任務填寫工作紀錄
              </DialogDescription>
            )}
          </DialogHeader>
          {rReportDialogProject && (
            <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className={cn('overflow-y-auto px-6 py-4 space-y-4 min-w-0',
              rFlowPanelOpen ? 'w-[57%] shrink-0 border-r' : 'flex-1')}>
              {/* Week selector (matching Gantt chart WeekPicker) */}
              <WeekPicker
                value={rReportWeekOf}
                onChange={(v) => { setRReportWeekOf(v); setRSelectedTaskId(null) }}
              />

              {/* Task list grouped by milestone */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">我的任務</span>
                  {(() => {
                    const vals = [...rTaskWeekStatus.values()].map(v => v.status)
                    const total = vals.length
                    const filled = vals.filter(s => s !== 'none').length
                    return total > 0 ? (
                      <span className={cn(
                        'text-[11px] px-1.5 py-0.5 rounded',
                        filled === total
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        {filled}/{total} 已填
                      </span>
                    ) : null
                  })()}
                </div>

                {/* 待完成 / A 確認中 / 完成區 分頁 */}
                <div className="flex items-center gap-1 border-b">
                  <button
                    type="button"
                    onClick={() => { setRDialogTab('active'); setRSelectedTaskId(null) }}
                    className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors',
                      rDialogTab === 'active' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
                  >
                    待完成
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRDialogTab('pending'); setRSelectedTaskId(null) }}
                    className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors flex items-center gap-1',
                      rDialogTab === 'pending' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
                    title="你送出後還沒落地的：報告審核中、被駁回、或已回報完成等當責確認"
                  >
                    待確認
                    {rPendingCount > 0 && (
                      <span className="text-[11px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">{rPendingCount}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRDialogTab('fix'); setRSelectedTaskId(null) }}
                    className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors flex items-center gap-1',
                      rDialogTab === 'fix' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
                    title="被審核主管或當責駁回、還沒重新送出的報告"
                  >
                    待修正
                    {rFixItems.length > 0 && (
                      <span className="text-[11px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full px-1.5 py-0.5">{rFixItems.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRDialogTab('done'); setRSelectedTaskId(null) }}
                    className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors flex items-center gap-1',
                      rDialogTab === 'done' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
                  >
                    完成區
                    {rDoneCount > 0 && (
                      <span className="text-[11px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{rDoneCount}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRDialogTab('history'); setRSelectedTaskId(null) }}
                    className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors',
                      rDialogTab === 'history' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
                    title="任務回報／確認／退回的歷程紀錄"
                  >
                    審視歷程
                  </button>
                </div>

                {/* 任務清單專屬捲動區：任務/群組再多也不會把整個彈窗撐長 */}
                <div className="max-h-[48vh] overflow-y-auto pr-1">
                {/* 單一欄位標題：開始/截止（僅待完成分頁；sticky 對齊任務列） */}
                {rDialogTab === 'active' && rActiveGroups.length > 0 && (
                  <div className="sticky top-0 z-10 bg-background flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
                    <span className="flex-1" />
                    <span className="w-14 text-center shrink-0">開始</span>
                    <span className="w-14 text-center shrink-0">截止</span>
                    <span className="w-16 shrink-0" />
                  </div>
                )}
                {rDialogTab === 'active' ? (
                  rActiveGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">目前沒有待完成、需填寫的任務</p>
                  ) : (
                  rActiveGroups.map((group, gIdx) => (
                    <div key={group.key} className={cn('space-y-1', gIdx > 0 && 'mt-3 pt-3 border-t border-border/40')}>
                      {/* 群組標頭：完整層級麵包屑 里程碑 › 父任務 › …（截止已改由各任務列呈現） */}
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-xs font-medium text-muted-foreground truncate">{group.pathLabel}</span>
                      </div>

                      {/* Task items — 只顯示最底層任務名，層級已由標頭麵包屑表達 */}
                      {group.tasks.map(task => {
                        const isSelected = rSelectedTaskId === task.id
                        const rStatInfo = rTaskWeekStatus.get(task.id)
                        const rStat = rStatInfo?.status || 'none'
                        const taskStatus = computeTaskStatus(task, rReportDialogProject!.taskLogs)
                        const fmtMD = (d: string) => new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })

                        return (
                          <div key={task.id} className="space-y-0">
                            {/* Task row (clickable) */}
                            <button
                              type="button"
                              onClick={() => handleRSelectTask(task.id)}
                              className={cn(
                                'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all',
                                isSelected
                                  ? 'border-primary bg-primary/5 shadow-sm'
                                  : 'border-border hover:bg-muted/50 hover:border-muted-foreground/20',
                              )}
                            >
                              {getStatusDot(taskStatus)}
                              <span className={cn('text-sm flex-1 truncate', isSelected && 'font-medium')}>
                                {task.title}
                              </span>
                              <span className="w-14 text-center text-xs tabular-nums text-muted-foreground shrink-0">
                                {fmtMD(task.startDate)}
                              </span>
                              <span className="w-14 text-center text-xs tabular-nums text-muted-foreground shrink-0">
                                {fmtMD(task.endDate)}
                              </span>
                              <span className="w-16 flex items-center justify-end gap-1 shrink-0">
                                {task.reportedDoneAt ? (
                                  <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 text-[11px] px-1.5 py-0 shrink-0" title="你已回報此任務完成／無後續，等待確認">
                                    <Check className="h-2.5 w-2.5 mr-0.5" />已回報
                                  </Badge>
                                ) : rStat === 'rejected' ? (
                                  <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 text-[11px] px-1.5 py-0 shrink-0" title="報告被審核主管駁回，請修改後重送">
                                    被駁回
                                  </Badge>
                                ) : rStat === 'reviewing' ? (
                                  <HoverCard openDelay={100} closeDelay={80}>
                                    <HoverCardTrigger asChild>
                                      <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 text-[11px] px-1.5 py-0 shrink-0 cursor-help">審核中</Badge>
                                    </HoverCardTrigger>
                                    <HoverCardContent align="end" className="w-auto max-w-[220px] p-0 overflow-hidden">
                                      <div className="flex items-center gap-1.5 border-b border-blue-100 bg-blue-50 px-2.5 py-1.5 dark:border-blue-900 dark:bg-blue-950/40">
                                        <ClipboardList className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                        <span className="text-xs font-medium text-blue-700 dark:text-blue-400">報告已送出，審核中</span>
                                      </div>
                                      <div className="space-y-1 px-2.5 py-2 text-xs">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-muted-foreground">審核主管</span>
                                          <span className="font-medium">{rStatInfo?.reviewerName || '未指定'}</span>
                                        </div>
                                        {rStatInfo && rStatInfo.waitDays > 0 && (
                                          <div className="text-muted-foreground">已等 {rStatInfo.waitDays} 天 · 可提醒主管審核</div>
                                        )}
                                      </div>
                                    </HoverCardContent>
                                  </HoverCard>
                                ) : rStat === 'published' ? (
                                  <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 text-[11px] px-1.5 py-0 shrink-0" title="已通過，進入更新紀錄">
                                    <Check className="h-2.5 w-2.5 mr-0.5" />已通過
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 text-muted-foreground shrink-0">
                                    未填
                                  </Badge>
                                )}
                                <ChevronDown className={cn(
                                  'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform',
                                  isSelected && 'rotate-180',
                                )} />
                              </span>
                            </button>

                            {/* Expanded: log entry form (matching Gantt chart design) */}
                            {isSelected && (
                              <div className="border border-t-0 rounded-b-lg px-4 py-4 space-y-4 bg-background">
                                {/* 有子任務時：撰寫報告 / 查看子層報告 分頁（讓被指派父層的 R 參考子層週報） */}
                                {rSelectedDescendants.length > 0 && (
                                  <div className="flex items-center gap-1 border-b">
                                    <button type="button" onClick={() => setRExpandSubTab('write')}
                                      className={cn('inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border-b-2 -mb-px transition-colors',
                                        rExpandSubTab === 'write' ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                                      <FileText className="h-3.5 w-3.5" />撰寫報告
                                    </button>
                                    <button type="button" onClick={() => setRExpandSubTab('children')}
                                      className={cn('inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border-b-2 -mb-px transition-colors',
                                        rExpandSubTab === 'children' ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                                      <ListChecks className="h-3.5 w-3.5" />查看子層報告
                                      <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">{rSelectedDescendants.length}</span>
                                    </button>
                                  </div>
                                )}
                                {(rSelectedDescendants.length === 0 || rExpandSubTab === 'write') ? (
                                <>
                                {/* 過去週別唯讀提示（避免誤改過去報告） */}
                                {!rIsCurrentWeek && (
                                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border bg-muted/40">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                      <Info className="h-3.5 w-3.5 shrink-0" />
                                      {rEditPastUnlocked ? '編輯過去週報中，請謹慎修改' : '此為非當週週報，預設唯讀以免誤改'}
                                    </span>
                                    {!rEditPastUnlocked && (
                                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setREditPastUnlocked(true)}>
                                        <Pencil className="h-3 w-3" />編輯
                                      </Button>
                                    )}
                                  </div>
                                )}
                                {/* Log entry table */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-medium text-muted-foreground">本周工作紀錄</span>
                                    <span className="text-[11px] text-muted-foreground/60">（不限每天都要填，日期也不限當周）</span>
                                  </div>
                                  {rRejectedNote && (
                                    <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 rounded-md px-2.5 py-1.5">
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                      <span><strong>報告被審核主管駁回</strong>：{rRejectedNote}　請修改後重新送出。</span>
                                    </div>
                                  )}
                                  {rDuplicateDates.size > 0 && (
                                    <div className="flex items-start gap-1.5 text-[11px] text-destructive bg-destructive/5 border border-destructive/30 rounded-md px-2.5 py-1.5">
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                      <span>
                                        有多列填了同一天（{[...rDuplicateDates].map(d => new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })).join('、')}）。同一天視為同一筆，請把附件／內容併到同一列後再提交，以免互相覆蓋。
                                      </span>
                                    </div>
                                  )}
                                  <div className="rounded-lg border overflow-hidden">
                                    <table className="w-full border-collapse">
                                      <thead>
                                        <tr className="bg-muted/40">
                                          <th className="text-[11px] font-medium text-muted-foreground text-left px-2 py-1.5 w-[120px] border-b">日期</th>
                                          <th className="text-[11px] font-medium text-muted-foreground text-left px-2 py-1.5 border-b">工作內容</th>
                                          <th className="text-[11px] font-medium text-muted-foreground text-center px-1 py-1.5 w-[36px] border-b">附件</th>
                                          <th className="w-[28px] border-b"></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {rLogRows.map((row, idx) => {
                                          const attCount = row.attachments?.length || 0
                                          return (
                                            <tr key={idx} className={cn('border-b border-border last:border-b-0',
                                              row.rejectedAt && 'bg-red-50/60 dark:bg-red-950/20')}>
                                              <td className="px-1.5 py-1.5 align-top">
                                                <input
                                                  type="date"
                                                  value={row.date}
                                                  disabled={rReadonly}
                                                  onChange={e => {
                                                    const updated = [...rLogRows]
                                                    updated[idx] = { ...updated[idx], date: e.target.value }
                                                    setRLogRows(updated)
                                                    setRDirty(true)
                                                  }}
                                                  className="w-full text-xs border rounded-md h-[34px] px-1.5 bg-background disabled:opacity-60 disabled:cursor-not-allowed"
                                                />
                                                {attCount > 0 && (
                                                  <div className="flex flex-wrap gap-1 mt-1">
                                                    {row.attachments!.map((att, ai) => att.type === 'image' ? (
                                                      <div key={ai} className="relative group/att">
                                                        <a href={att.url} target="_blank" rel="noopener">
                                                          <img src={att.url} alt={att.name} className="h-7 w-7 rounded object-cover border hover:opacity-80" />
                                                        </a>
                                                        <button
                                                          type="button"
                                                          onClick={() => setRPendingDelete({ kind: 'att', rowIdx: idx, attIdx: ai })}
                                                          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                                                          title="刪除附件"
                                                        >
                                                          <X className="h-2 w-2" />
                                                        </button>
                                                      </div>
                                                    ) : (
                                                      <div key={ai} className="relative group/att flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[11px]">
                                                        <TooltipProvider delayDuration={100}>
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <a href={att.url} download={att.name} target="_blank" rel="noopener" className="flex items-center gap-1 hover:opacity-80 min-w-0">
                                                                <Paperclip className="h-3 w-3 shrink-0" />
                                                                <span className="truncate max-w-[90px]">{att.name}</span>
                                                              </a>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top" className="text-xs max-w-[280px] break-all">{att.name}</TooltipContent>
                                                          </Tooltip>
                                                        </TooltipProvider>
                                                        <button
                                                          type="button"
                                                          onClick={() => setRPendingDelete({ kind: 'att', rowIdx: idx, attIdx: ai })}
                                                          className="shrink-0 text-muted-foreground/60 hover:text-destructive"
                                                          title="刪除附件"
                                                        >
                                                          <X className="h-2.5 w-2.5" />
                                                        </button>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </td>
                                              <td className="px-1.5 py-1.5 align-top">
                                                <textarea
                                                  ref={(el) => {
                                                    if (!el) return
                                                    el.style.height = '34px'
                                                    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
                                                    el.style.overflowY = el.scrollHeight > 240 ? 'auto' : 'hidden'
                                                  }}
                                                  placeholder="工作內容..."
                                                  value={row.content}
                                                  readOnly={rReadonly}
                                                  onChange={e => {
                                                    const updated = [...rLogRows]
                                                    updated[idx] = { ...updated[idx], content: e.target.value }
                                                    setRLogRows(updated)
                                                    setRDirty(true)
                                                    e.target.style.height = '34px'
                                                    e.target.style.height = Math.min(e.target.scrollHeight, 240) + 'px'
                                                    e.target.style.overflowY = e.target.scrollHeight > 240 ? 'auto' : 'hidden'
                                                  }}
                                                  rows={1}
                                                  className="w-full min-h-[34px] text-xs resize-none border rounded-md bg-background px-2 py-[7px] focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30"
                                                />
                                              </td>
                                              <td className="px-0.5 py-1.5 align-top text-center">
                                                <button
                                                  type="button"
                                                  disabled={rReadonly}
                                                  onClick={() => {
                                                    rRowTargetIdx.current = idx
                                                    rRowFileInputRef.current?.click()
                                                  }}
                                                  className={cn(
                                                    'inline-flex items-center justify-center w-[34px] h-[34px] border rounded-md bg-background hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                                                    attCount > 0 ? 'text-primary border-primary/30' : 'text-muted-foreground/40',
                                                  )}
                                                  title="上傳附件"
                                                >
                                                  {rUploadingRowIdx === idx
                                                    ? (rUploadProgress > 0
                                                        ? <span className="text-[11px] font-medium tabular-nums leading-none">{rUploadProgress}%</span>
                                                        : <Loader2 className="h-3.5 w-3.5 animate-spin" />)
                                                    : <Paperclip className="h-3.5 w-3.5" />
                                                  }
                                                </button>
                                              </td>
                                              <td className="px-0 py-1.5 align-top text-center">
                                                {(row.existingLogId || rLogRows.length > 1) && !rReadonly ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => setRPendingDelete({ kind: 'row', idx })}
                                                    className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                    title={row.existingLogId ? '刪除此紀錄' : '移除此列'}
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </button>
                                                ) : <div className="w-[34px] h-[34px]" />}
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>

                                    {/* Hidden file input */}
                                    <input
                                      ref={rRowFileInputRef}
                                      type="file"
                                      multiple
                                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                                      className="hidden"
                                      onChange={handleRRowFileSelect}
                                    />

                                    {!rReadonly && (
                                      <button
                                        type="button"
                                        className="w-full text-xs text-primary hover:bg-primary/5 transition-colors py-2 border-t border-dashed border-primary/20"
                                        onClick={() => { setRLogRows([...rLogRows, { date: '', content: '' }]); setRDirty(true) }}
                                      >
                                        + 新增一列
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Divider */}
                                <div className="border-t border-dashed border-border" />

                                {/* Next week plan */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-medium text-muted-foreground">預計下周工作</span>
                                    <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">選填</span>
                                  </div>
                                  <Textarea
                                    placeholder="預計下周要做什麼..."
                                    value={rLogNextWeekPlan}
                                    readOnly={rReadonly}
                                    onChange={e => { setRLogNextWeekPlan(e.target.value); setRDirty(true) }}
                                    rows={2}
                                    className="min-h-[60px] text-sm resize-y"
                                  />
                                </div>

                                {/* R 回報完成（開確認視窗）+ 提交 — 過去週別未按「編輯」時整排隱藏，避免誤導可編輯 */}
                                {!rReadonly && (
                                  <div className="flex items-center justify-between gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 gap-1.5 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
                                      disabled={rTogglingDone === task.id}
                                      onClick={() => setRConfirmDone(task)}
                                      title="回報此任務已完成、之後不會再有進度，交由審核方確認是否正式結案"
                                    >
                                      <CircleCheck className="h-3.5 w-3.5" />
                                      回報完成（無後續）
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="gap-1.5 rounded-lg shadow-sm text-sm"
                                      disabled={
                                        !rDirty
                                        || rDuplicateDates.size > 0
                                        || !rLogRows.every(r => r.content.trim() && r.date)
                                        || rSubmittingBatch
                                      }
                                      onClick={() => handleRBatchSubmitLogs()}
                                      title={
                                        rDuplicateDates.size > 0 ? '有重複日期的列，請先合併到同一列再提交'
                                          : !rLogRows.every(r => r.content.trim() && r.date) ? '每一列都要同時填「日期」與「工作內容」才能送出，空白或只填一半的列請補齊或刪除'
                                            : !rDirty ? '內容尚未有變更，修改或新增後才能提交'
                                              : undefined
                                      }
                                    >
                                      {rSubmittingBatch ? (
                                        <><Loader2 className="h-3.5 w-3.5 animate-spin" />儲存中...</>
                                      ) : (
                                        <><Send className="h-3.5 w-3.5" />提交週報</>
                                      )}
                                    </Button>
                                  </div>
                                )}
                                </>
                                ) : (
                                  <div className="space-y-3">
                                    <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground bg-muted/40 border rounded-md px-2.5 py-1.5">
                                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                      <span>這是你負責的父任務。以下可查看各子任務的過往每週報告，作為你撰寫報告的參考（唯讀）。</span>
                                    </div>
                                    {/* 子任務挑選：可搜尋下拉，子任務多也好操作 */}
                                    <Popover open={rChildPickerOpen} onOpenChange={setRChildPickerOpen}>
                                      <PopoverTrigger asChild>
                                        <button
                                          type="button"
                                          className="w-full flex items-center gap-2 text-sm px-3 py-2 rounded-md border hover:bg-muted/50 transition-colors"
                                        >
                                          <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
                                          <span className={cn('flex-1 text-left truncate', !rChildViewTaskId && 'text-muted-foreground')}>
                                            {rSelectedDescendants.find(d => d.task.id === rChildViewTaskId)?.task.title || `選擇子任務（共 ${rSelectedDescendants.length} 個）`}
                                          </span>
                                          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent align="start" collisionPadding={12} className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]">
                                        <Command>
                                          <CommandInput placeholder="搜尋子任務…" className="text-sm" />
                                          <CommandList className="max-h-[min(288px,calc(var(--radix-popover-content-available-height)_-_52px))]">
                                            <CommandEmpty>找不到子任務</CommandEmpty>
                                            {rSelectedDescendants.map(({ task: c, depth }) => (
                                              <CommandItem
                                                key={c.id}
                                                value={`${c.title} ${c.id}`}
                                                onSelect={() => { setRChildViewTaskId(c.id); setRChildPickerOpen(false) }}
                                                className="text-sm gap-2"
                                              >
                                                <span className="flex items-center gap-1 min-w-0 flex-1" style={{ paddingLeft: depth * 12 }}>
                                                  {depth > 0 && <span className="opacity-40 shrink-0">└</span>}
                                                  <span className="truncate">{c.title}</span>
                                                </span>
                                                {rChildViewTaskId === c.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                                              </CommandItem>
                                            ))}
                                          </CommandList>
                                        </Command>
                                      </PopoverContent>
                                    </Popover>
                                    {/* 選定子任務的週報（依填報週分組） */}
                                    {!rChildViewTaskId ? (
                                      <p className="text-sm text-muted-foreground text-center py-6">選擇子任務，查看它的過往週報</p>
                                    ) : rChildWeekGroups.length === 0 ? (
                                      <p className="text-sm text-muted-foreground text-center py-6">此子任務尚無已進紀錄的週報</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {rChildWeekGroups.map(g => (
                                          <div key={g.key} className="rounded-lg border overflow-hidden">
                                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/40 text-xs font-medium text-muted-foreground">
                                              <CalendarClock className="h-3.5 w-3.5" />
                                              {formatReportWeek(g.monday) || '（未標填報週）'}
                                            </div>
                                            {renderReviewLogs(g.logs)}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))
                  )
                ) : rDialogTab === 'history' ? (
                  rReviewEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">目前沒有審視歷程</p>
                  ) : (
                    <div className="rounded-lg border border-border/60 overflow-hidden">
                      <div className="max-h-[300px] overflow-y-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                            <tr className="text-muted-foreground">
                              <th className="text-left font-medium px-2 py-1.5 w-[96px] border-b">時間</th>
                              <th className="text-left font-medium px-2 py-1.5 border-b">任務</th>
                              <th className="text-left font-medium px-2 py-1.5 w-[104px] border-b">事件</th>
                              <th className="text-left font-medium px-2 py-1.5 w-[76px] border-b">操作人</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rReviewEvents.map(ev => {
                              const meta = REVIEW_EVENT_META[ev.type] || { label: ev.type, cls: 'bg-muted text-muted-foreground border-border' }
                              const d = new Date(ev.createdAt)
                              return (
                                <tr key={ev.id} className="border-b border-border/40 last:border-b-0 align-top hover:bg-muted/30">
                                  <td className="px-2 py-1.5 text-muted-foreground/80 whitespace-nowrap tabular-nums">
                                    {d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} {d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="px-2 py-1.5 text-foreground/85 break-words">
                                    {ev.path ? <span className="block text-[11px] text-muted-foreground/80 truncate">{ev.path}</span> : null}
                                    {ev.taskTitle}
                                    {ev.note ? <span className="mt-0.5 block text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-1.5 py-0.5">退回原因：{ev.note}</span> : null}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <Badge variant="outline" className={cn('text-[11px] px-1.5 py-0.5 whitespace-nowrap', meta.cls)}>{meta.label}</Badge>
                                  </td>
                                  <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{ev.actor || '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                ) : (
                  rDialogTab === 'fix' ? (
                    rFixItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">目前沒有被駁回待修正的報告</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                          <span>要回到<b>原本那一週</b>修改再送出，在別週另寫不會補回該週紀錄。</span>
                        </div>
                        {rFixItems.map(item => (
                          <div key={item.log.id} className="rounded-lg border border-red-200 dark:border-red-900 overflow-hidden">
                            <div className="px-3 py-2.5 bg-red-50/50 dark:bg-red-950/20">
                              {item.path && <div className="text-[11px] text-muted-foreground truncate">{item.path}</div>}
                              <div className="flex items-start gap-2 mt-0.5">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate">{item.taskTitle}</div>
                                  <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
                                    <span className="rounded bg-muted px-1.5 py-0.5 whitespace-nowrap">
                                      {item.weekOf ? formatReportWeek(item.weekOf) : '未標填報週'}
                                    </span>
                                    {item.rejectedBy && <span>由 {item.rejectedBy} 駁回</span>}
                                    <span className="tabular-nums text-red-600 dark:text-red-400">已擱置 {item.days} 天</span>
                                  </div>
                                </div>
                                <Button size="sm" className="h-7 text-xs gap-1 shrink-0"
                                  onClick={() => goFixRejected(item)}>
                                  <ArrowRight className="h-3.5 w-3.5" />去修正
                                </Button>
                              </div>
                              {item.note && (
                                <p className="mt-2 rounded border border-red-200 bg-background px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:text-red-400">
                                  <span className="font-medium">駁回原因：</span>{item.note}
                                </p>
                              )}
                              <p className="mt-1.5 text-[11px] text-muted-foreground truncate" title={item.log.content}>
                                原內容：{item.log.content}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (rDialogTab === 'pending' ? rPendingGroups : rDoneGroups).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {rDialogTab === 'pending' ? '目前沒有等待確認的任務' : '目前沒有已完成的任務'}
                    </p>
                  ) : (
                  (rDialogTab === 'pending' ? rPendingGroups : rDoneGroups).map((group, gIdx) => (
                    <div key={group.key} className={cn('space-y-1', gIdx > 0 && 'mt-3 pt-3 border-t border-border/40')}>
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-xs font-medium text-muted-foreground truncate">{group.pathLabel}</span>
                      </div>
                      {group.tasks.map(task => {
                        const fmtMD = (d: string) => new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
                        const aDone = !!task.completedAt
                        const expanded = rDoneExpanded.has(task.id)
                        const logs = (rReportDialogProject?.taskLogs || [])
                          .filter(l => l.taskId === task.id)
                          .sort((a, b) => a.logDate.localeCompare(b.logDate))
                        return (
                          <div key={task.id}>
                            <div
                              onClick={() => setRDoneExpanded(prev => {
                                const n = new Set(prev)
                                if (n.has(task.id)) n.delete(task.id); else n.add(task.id)
                                return n
                              })}
                              className="group flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/60 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                            >
                              <span className={cn('h-2 w-2 rounded-full shrink-0', (aDone || task.reviewedAt) ? 'bg-green-500' : 'bg-amber-500')} />
                              <span className="text-sm flex-1 truncate text-muted-foreground">{task.title}</span>
                              {/* 補充入口。平時隱藏、hover（或鍵盤聚焦）才浮出，避免完成區被按鈕塞滿 */}
                              {aDone && isSameUser(task.assignee, user) && (
                                <Button
                                  size="sm" variant="outline"
                                  className="h-7 shrink-0 gap-1 border-primary/40 bg-primary/10 px-2.5 text-xs font-medium text-primary shadow-sm transition-all hover:bg-primary/20 hover:text-primary opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                  title="補交這個任務當時的紀錄或文件"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setRSupRows([{ date: task.completedAt?.slice(0, 10) || '', content: '' }])
                                    setRSupTask({ id: task.id, title: task.title, projectId: rReportDialogProject!.id, completedAt: task.completedAt ?? null })
                                  }}
                                >
                                  <PenLine className="h-3 w-3" />我要補充
                                </Button>
                              )}
                              <span className="text-xs tabular-nums text-muted-foreground/70 shrink-0">{fmtMD(task.startDate)} → {fmtMD(task.endDate)}</span>
                              {aDone ? (
                                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 text-[11px] px-1.5 py-0.5 shrink-0" title={task.completedBy ? `由 ${task.completedBy} 確認完成` : undefined}>
                                  <Check className="h-3 w-3 mr-0.5" />已完成
                                </Badge>
                              ) : task.reviewedAt ? (
                                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 text-[11px] px-1.5 py-0.5 shrink-0" title="當責已審核通過你的回報（是否算完成由當責在報告中決定）">
                                  <Check className="h-3 w-3 mr-0.5" />已審核通過
                                </Badge>
                              ) : task.reportedDoneAt ? (
                                <span className="flex items-center gap-1 shrink-0">
                                  <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 text-[11px] px-1.5 py-0.5" title="已回報任務完成，等待當責確認">
                                    <Check className="h-3 w-3 mr-0.5" />等確認完成
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1.5 text-[11px] text-muted-foreground gap-1"
                                    disabled={rTogglingDone === task.id}
                                    onClick={(e) => { e.stopPropagation(); setRConfirmCancel(task) }}
                                    title="取消回報，任務回到待完成"
                                  >
                                    {rTogglingDone === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                                    取消回報
                                  </Button>
                                </span>
                              ) : (
                                // 因「報告還在途」而進到待確認的：沒有回報完成可取消，只標它卡在哪一棒
                                (() => {
                                  const f = rFlowOf(task.id)
                                  return f
                                    ? <StageChip stage={f.stage} viewer="executor" days={f.stuckDays} className="shrink-0" />
                                    : null
                                })()
                              )}
                              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-180')} />
                            </div>
                            {expanded && (
                              <div className="mt-1.5">
                              <div className="rounded-lg border border-border/60 overflow-hidden">
                                {logs.length === 0 ? (
                                  <p className="text-xs text-muted-foreground/60 px-3 py-3 text-center">尚無工作紀錄</p>
                                ) : (
                                  <div className="max-h-[220px] overflow-y-auto">
                                    <table className="w-full text-xs border-collapse">
                                      <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                                        <tr className="text-muted-foreground">
                                          <th className="text-left font-medium px-2 py-1.5 w-[60px] border-b">日期</th>
                                          <th className="text-left font-medium px-2 py-1.5 w-[80px] border-b">填寫人</th>
                                          <th className="text-left font-medium px-2 py-1.5 border-b">工作內容</th>
                                          <th className="text-center font-medium px-2 py-1.5 w-[48px] border-b">附件</th>
                                          <th className="text-left font-medium px-2 py-1.5 w-[88px] border-b">最後編輯</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {logs.map(l => (
                                          <tr key={l.id} className="border-b border-border/40 last:border-b-0 align-top hover:bg-muted/30">
                                            <td className="px-2 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap">{new Date(l.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</td>
                                            <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{l.author}</td>
                                            <td className="px-2 py-1.5 text-foreground/85 whitespace-pre-wrap break-words">
                                              {l.postDoneSupplement && (
                                                <span className="mr-1.5 inline-block rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300">完成後補充</span>
                                              )}
                                              {l.content}
                                            </td>
                                            <td className="px-2 py-1.5 text-center">
                                              {l.attachments && l.attachments.length > 0 ? (
                                                <Popover>
                                                  <PopoverTrigger asChild>
                                                    <button
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:bg-primary/10 rounded px-1.5 py-0.5"
                                                      title="查看附件"
                                                    >
                                                      <Paperclip className="h-3 w-3" />{l.attachments.length}
                                                    </button>
                                                  </PopoverTrigger>
                                                  <PopoverContent align="end" className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
                                                    <div className="text-[11px] font-medium text-muted-foreground mb-1.5 px-1">附件（{l.attachments.length}）</div>
                                                    <div className="space-y-0.5 max-h-[220px] overflow-y-auto">
                                                      {l.attachments.map((att, ai) => (
                                                        <a key={ai} href={att.url} download={att.name} target="_blank" rel="noopener" className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted text-xs">
                                                          {att.type === 'image'
                                                            ? <img src={att.url} alt={att.name} className="h-8 w-8 rounded object-cover border shrink-0" />
                                                            : <span className="h-8 w-8 rounded border bg-muted flex items-center justify-center shrink-0"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                                                          <span className="truncate flex-1">{att.name}</span>
                                                        </a>
                                                      ))}
                                                    </div>
                                                  </PopoverContent>
                                                </Popover>
                                              ) : <span className="text-muted-foreground/30">—</span>}
                                            </td>
                                            <td className="px-2 py-1.5 text-[11px] text-muted-foreground/70 whitespace-nowrap tabular-nums" title={l.lastEditedBy ? `編輯者：${l.lastEditedBy}` : undefined}>
                                              {l.updatedAt
                                                ? `${new Date(l.updatedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} ${new Date(l.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
                                                : '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))
                  )
                )}
                </div>
              </div>
            </div>

            {/* ── 右欄：這個任務的審核流程 / 工作紀錄（預設收起）── */}
            {!rFlowPanelOpen && (
              <ReviewFlowCollapsed
                onExpand={() => setRFlowPanelOpen(true)}
                label={rDialogTab === 'active' ? '工作紀錄' : '審核流程 · 工作紀錄'}
              />
            )}
            {rFlowPanelOpen && (
              <div className="flex-1 min-w-0 flex flex-col bg-muted/10">
                {rSelectedFlow ? (
                  <ReviewFlowTimeline
                    key={rSelectedFlow.taskId}
                    className="animate-in fade-in slide-in-from-right-4 duration-200"
                    flow={rSelectedFlow}
                    viewer="executor"
                    tab={rFlowTab}
                    onTabChange={setRFlowTab}
                    onCollapse={() => setRFlowPanelOpen(false)}
                    logsCount={rSelectedFlowLogs.length}
                    logs={renderReviewLogs(toLogRows(rSelectedFlowLogs))}
                    chainFilter={{
                      value: rFlowChainKey ?? 'all',
                      options: rChainInfo.chains,
                      onChange: v => setRFlowChainKey(v === 'all' ? null : v),
                    }}
                    // 待完成＝本週還沒送出，此時流程講的是上一份報告，顯示出來會讓 R
                    // 誤以為自己已經送出並在被審核。只給工作紀錄當寫報告的參考。
                    hideFlow={rDialogTab === 'active'}
                  />
                ) : (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex justify-end border-b px-2 py-1.5 shrink-0">
                      <button type="button" onClick={() => setRFlowPanelOpen(false)} title="收合右欄"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <PanelRightClose className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                      <FileText className="h-7 w-7 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        {rDialogTab === 'active'
                          ? '點左側任一任務，這裡會顯示它過去的工作紀錄，方便你參考著寫'
                          : '點左側任一任務，這裡會顯示它的審核流程與工作紀錄'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* R 回報完成 確認視窗 */}
      <AlertDialog open={!!rConfirmDone} onOpenChange={(open) => { if (!open) setRConfirmDone(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>回報此任務已完成、無後續？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  任務「{rConfirmDone?.title}」將移到「待確認」等待審核。
                  <span className="text-amber-600 dark:text-amber-400 font-medium">回報後無法再編輯此任務週報</span>
                  （可在待確認按「取消回報」還原）。
                </div>
                {rConfirmHasUnsaved ? (
                  <div className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5 shrink-0" />已填內容會一併提交，不會遺失。
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3.5 w-3.5 shrink-0" />尚未偵測到已填內容。
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600"
              onClick={handleConfirmReportDone}
            >
              {rConfirmHasUnsaved ? '提交並回報完成' : '確定回報完成'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* R 重送「已通過」報告 確認視窗（避免誤操作，讓主管/A 覺得奇怪） */}
      <AlertDialog open={rResubmitConfirm} onOpenChange={(open) => { if (!open) setRResubmitConfirm(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>已通過的報告要重新送出？</AlertDialogTitle>
            <AlertDialogDescription>
              重送後這週報告會<span className="text-amber-600 dark:text-amber-400 font-medium">回到「審核中」，需主管再審一次</span>。若只是誤按請取消。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setRResubmitConfirm(false); handleRBatchSubmitLogs(true) }}>
              確定重新送出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* R 取消回報 確認視窗（A 確認中，避免任務跳來跳去讓 A 困惑） */}
      <AlertDialog open={!!rConfirmCancel} onOpenChange={(open) => { if (!open) setRConfirmCancel(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消回報、把任務收回？</AlertDialogTitle>
            <AlertDialogDescription>
              任務「{rConfirmCancel?.title}」目前正等待確認。取消後它會退出「待確認」、回到你的「待完成」，
              <br />
              <span className="text-amber-600 dark:text-amber-400 font-medium">審核方就不會再看到這筆待確認</span>
              。若對方可能正在審視，建議先溝通再取消，以免造成困惑。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>先不要</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600"
              onClick={() => { const t = rConfirmCancel; setRConfirmCancel(null); if (t) handleToggleReportedDone(t.id, false) }}
            >
              確定取消回報
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 未提交就關閉的提醒（避免使用者關掉後資料消失又怪系統） */}
      <AlertDialog open={rConfirmClose} onOpenChange={(open) => { if (!open) setRConfirmClose(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>尚未提交，確定關閉？</AlertDialogTitle>
            <AlertDialogDescription>
              你已填寫內容但<span className="text-destructive font-medium">尚未按「提交週報」或「回報完成」</span>。
              <br />
              直接關閉的話，這次填的內容<span className="text-destructive font-medium">不會保存</span>。系統不會自動暫存，請先提交再關閉。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回繼續填寫</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
              onClick={() => closeRReportDialog()}
            >
              仍要關閉（不保存）
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 週報操作錯誤提示（取代 window.alert） */}
      <AlertDialog open={!!rErrorMsg} onOpenChange={(open) => { if (!open) setRErrorMsg(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>操作未成功</AlertDialogTitle>
            <AlertDialogDescription>{rErrorMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setRErrorMsg(null)}>我知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── A Tab: R Member Reports Dialog ── */}
      <Dialog open={aRReportDialogOpen} onOpenChange={(open) => {
        setARReportDialogOpen(open)
        if (!open) { setARReportProject(null); setARReportFilterUser(null) }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="text-base">R 成員週報</DialogTitle>
            {aRReportProject && (
              <DialogDescription className="text-sm">
                {aRReportProject.name} — 查看執行者提交的工作紀錄
              </DialogDescription>
            )}
          </DialogHeader>
          {aRReportProject && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Week picker */}
              <WeekPicker
                value={aRReportWeekOf}
                onChange={(v) => {
                  setARReportWeekOf(v)
                  setARReportFilterUser(null)
                  fetchARReportData(aRReportProject.id, v)
                }}
              />

              {aRReportLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Clickable member filter badges */}
                  <div className="flex flex-wrap gap-2">
                    {aRReportData.memberStatus.length > 1 && (
                      <button
                        onClick={() => setARReportFilterUser(null)}
                        className={cn(
                          'flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
                          aRReportFilterUser === null
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/60',
                        )}
                      >
                        全部
                      </button>
                    )}
                    {aRReportData.memberStatus.map((m: any) => (
                      <button
                        key={m.userId}
                        onClick={() => setARReportFilterUser(prev => prev === m.userId ? null : m.userId)}
                        className={cn(
                          'flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
                          aRReportFilterUser === m.userId
                            ? 'bg-primary text-primary-foreground border-primary'
                            : m.submitted
                              ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/40'
                              : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40',
                        )}
                      >
                        {aRReportFilterUser !== m.userId && (m.submitted ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />)}
                        {m.name}
                        {m.submitted && <span className="text-xs opacity-70">({m.reportCount})</span>}
                      </button>
                    ))}
                  </div>

                  {aRReportData.memberStatus.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">此專案尚無 R 角色成員</p>
                  )}

                  {/* Task logs per member */}
                  {aRReportData.memberStatus
                    .filter((m: any) => m.submitted && (!aRReportFilterUser || aRReportFilterUser === m.userId))
                    .map((member: any) => {
                    const memberLogs = aRReportData.reports.filter((r: any) => r.userId === member.userId)
                    // Group by milestone → task
                    const byMilestone = new Map<string, { name: string; logs: any[] }>()
                    for (const log of memberLogs) {
                      const key = log.milestoneId
                      if (!byMilestone.has(key)) byMilestone.set(key, { name: log.milestoneName, logs: [] })
                      byMilestone.get(key)!.logs.push(log)
                    }
                    return (
                      <div key={member.userId} className="border rounded-lg overflow-hidden">
                        <div className="px-4 py-2.5 bg-muted/30 flex items-center gap-2 sticky top-0 z-10">
                          <UserCheck className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium">{member.name}</span>
                          <Badge variant="secondary" className="text-xs ml-auto">{memberLogs.length} 筆紀錄</Badge>
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto divide-y">
                          {[...byMilestone.entries()].map(([msId, { name: msName, logs }]) => (
                            <div key={msId} className="px-4 py-3 space-y-3">
                              <div className="text-xs font-semibold text-muted-foreground">{msName}</div>
                              {logs.map((log: any) => {
                                let parsedNextPlans: { date?: string; content: string }[] = []
                                let parsedAttachments: { name: string; url: string; type?: string }[] = []
                                try { if (log.nextPlans) parsedNextPlans = JSON.parse(log.nextPlans) } catch {}
                                try { if (log.attachments) parsedAttachments = JSON.parse(log.attachments) } catch {}
                                return (
                                  <div key={log.id} className="pl-3 border-l-2 border-primary/20 space-y-1.5">
                                    {/* Header: task/subtask label + name + date */}
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className={cn('text-[11px] px-1 py-0 shrink-0', log.isSubtask ? 'border-amber-300 text-amber-600 dark:text-amber-400' : 'border-blue-300 text-blue-600 dark:text-blue-400')}>
                                        {log.isSubtask ? '子任務' : '任務'}
                                      </Badge>
                                      <span className="text-sm font-medium">{log.taskTitle}</span>
                                      <span className="text-[11px] text-muted-foreground ml-auto shrink-0 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />{log.logDate}
                                      </span>
                                    </div>
                                    {/* Content */}
                                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{log.content}</p>
                                    {/* Next plans */}
                                    {parsedNextPlans.length > 0 && (
                                      <div className="text-xs bg-blue-50 dark:bg-blue-950/20 rounded px-2.5 py-1.5 space-y-0.5">
                                        <span className="font-medium text-blue-700 dark:text-blue-400">下週計畫：</span>
                                        {parsedNextPlans.map((p, pi) => (
                                          <div key={pi} className="text-blue-600 dark:text-blue-400 flex items-start gap-1">
                                            <span className="shrink-0">•</span>
                                            <span>{p.date ? `${p.date} ` : ''}{p.content}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {/* Attachments */}
                                    {parsedAttachments.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {parsedAttachments.map((att, ai) => (
                                          <a
                                            key={ai}
                                            href={att.url}
                                            download={att.name}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                          >
                                            <Paperclip className="h-3 w-3" />{att.name}
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* Show "not submitted" members when filtered */}
                  {aRReportFilterUser && aRReportData.memberStatus.find((m: any) => m.userId === aRReportFilterUser && !m.submitted) && (
                    <p className="text-sm text-muted-foreground text-center py-4">此成員本週尚未提交工作紀錄</p>
                  )}

                  {!aRReportFilterUser && aRReportData.memberStatus.filter((m: any) => m.submitted).length === 0 && aRReportData.memberStatus.length > 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">本週尚無 R 成員提交工作紀錄</p>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── PM Project Edit Dialog ── */}
      {editProjectOpen && editProject && (
        <ProjectEditDialog
          open={editProjectOpen}
          onOpenChange={open => {
            setEditProjectOpen(open)
            if (!open) setEditProject(null)
          }}
          project={editProject}
          defaultTab="workitems"
          onSave={handleEditProjectSave}
          onWorkItemsChange={async () => {
            // Refresh my-tasks data after workitems change
            if (user) {
              const res = await fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
              if (res.ok) {
                const data = await res.json()
                setApiProjects(data.projects ?? [])
              }
            }
          }}
        />
      )}

      {/* 撤回確認：必填原因。文案一律以「後來發現沒做完」的語氣，不要求人承認按錯。 */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) { setRevokeTarget(null); setRevokeReason('') } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revokeTarget?.kind === 'confirm' ? '撤回完成確認？'
                : revokeTarget?.supplement ? '撤回這批補充？' : '撤回核准？'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {revokeTarget?.kind === 'confirm' ? (
                  <>
                    <div>「{revokeTarget.title}」退回「待你處理」，執行者的回報保留。</div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                      甘特、完成區、里程碑進度會一併退回
                    </div>
                    <div>會通知執行者與審核主管。</div>
                  </>
                ) : revokeTarget?.supplement ? (
                  <>
                    {/* 一個任務可能有很多批補充，一定要指名撤的是哪一批 */}
                    <div>
                      撤回「{revokeTarget.title}」的
                      <b className="text-foreground">{revokeTarget.chainLabel || '完成後補充'}</b>
                      ，這批補充會退出更新紀錄、回到待審。
                    </div>
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                      不影響甘特、完成區與里程碑——任務維持已完成，完成日不變
                    </div>
                    <div className="text-muted-foreground">同一任務的其他報告與其他批補充都不受影響。</div>
                  </>
                ) : (
                  <>
                    <div>收回<b>你在「R主管審核」的核准</b>：「{revokeTarget?.title}」的報告退回「待審核」，並從更新紀錄移除。</div>
                    <div className="text-muted-foreground">不會動到當責那一棒——若要退回當責的確認，需由當責自己操作。</div>
                    <div>會通知執行者與當責。</div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium flex items-center gap-1">
              撤回原因 <span className="text-destructive">*</span>
              {!revokeReason.trim() && <span className="text-[11px] text-destructive font-normal">（必填）</span>}
            </label>
            <Textarea value={revokeReason} onChange={e => setRevokeReason(e.target.value)} rows={3}
              placeholder="例：後來發現還有項目沒做完、驗收未通過…" className="text-sm" autoFocus />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 disabled:opacity-50 disabled:pointer-events-none"
              disabled={!revokeReason.trim() || revokeBusy}
              onClick={(e) => { e.preventDefault(); doRevoke() }}>
              {revokeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}確認撤回
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* A 代審報告的駁回原因（該成員未設主管時） */}
      <AlertDialog open={!!aReportReject} onOpenChange={(o) => { if (!o) setAReportReject(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>駁回報告並退回重寫？</AlertDialogTitle>
            <AlertDialogDescription>
              「{aReportReject?.title}」的本週報告會退回給執行者重寫，不會進入更新紀錄。請填寫原因讓對方知道要改什麼。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium flex items-center gap-1">
              駁回原因 <span className="text-destructive">*</span>
              {!aReportRejectReason.trim() && <span className="text-[11px] text-destructive font-normal">（必填）</span>}
            </label>
            <Textarea value={aReportRejectReason} onChange={e => setAReportRejectReason(e.target.value)} rows={3}
              placeholder="會記錄在審視歷程，並讓對方知道要改什麼…" className="text-sm" autoFocus />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 disabled:opacity-50 disabled:pointer-events-none"
              disabled={!aReportRejectReason.trim()}
              onClick={async () => {
                const note = aReportRejectReason.trim()
                setAReportReject(null); setAReportRejectReason('')
                await aReviewReport('reject', note)
              }}>
              確認駁回
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 審核中心（當責 A）── */}
      <Dialog open={reviewCenterOpen} onOpenChange={setReviewCenterOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" />週報審核{reviewShownName ? ` — ${reviewShownName}` : ''}</DialogTitle>
            <DialogDescription className="text-sm">
              {reviewTab === 'history'
                ? <>已處理的確認 / 駁回紀錄。</>
                : <>點棒次篩選；點左側任一列看完整流程。</>}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pt-3">
            <div className={cn('flex items-center gap-1 border-b', reviewStageFilter && 'opacity-40 pointer-events-none')}>
              <button type="button" onClick={() => { setReviewTab('pending'); setReviewFlowTaskId(null) }}
                className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors flex items-center gap-1',
                  reviewTab === 'pending' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                待你處理
                {reviewPipeline.counts.accountable > 0 && <span className="text-[11px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">{reviewPipeline.counts.accountable}</span>}
              </button>
              <button type="button" onClick={() => { setReviewTab('members'); setReviewFlowTaskId(null) }}
                className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors flex items-center gap-1',
                  reviewTab === 'members' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
                title="依週別查看所有人的週報，並看出誰沒送出">
                成員週報
                {reviewMissingCount > 0 && <span className="text-[11px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full px-1.5 py-0.5">{reviewMissingCount}</span>}
              </button>
              <button type="button" onClick={() => { setReviewTab('history'); setReviewFlowTaskId(null) }}
                className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors',
                  reviewTab === 'history' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                已處理履歷
              </button>
            </div>
          </div>

          {/* 流程總覽列：四棒各積了幾件，點一棒＝只看卡在那棒的項目 */}
          {reviewTab !== 'history' && (
            <div className="px-6 py-2.5 border-b bg-muted/20">
              {reviewNoReviewerCount > 0 && (
                <div className="mb-2 flex items-start gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[11px] text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  <span>
                    <b>{reviewNoReviewerCount}</b> 位成員未設「報告審核主管」，報告直接由你審核。可到專案「團隊」指定。
                  </span>
                </div>
              )}
              <ReviewPipelineBar
                counts={reviewPipeline.counts}
                value={reviewStageFilter}
                onChange={(next) => { setReviewStageFilter(next); setReviewFlowTaskId(null) }}
                viewer="accountable"
              />
            </div>
          )}

          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* ── 左欄：清單 ── */}
            <div className={cn(
              // 流程清單自己貼齊四邊：容器不能有垂直內距，否則 sticky 群組標題上方
              // 會留一條蓋不到的縫，列會從那裡穿過去。
              'overflow-y-auto min-w-0',
              reviewTab === 'history' ? 'flex-1 px-6 py-4'
                : flowPanelOpen ? 'w-[57%] shrink-0 border-r'
                  : 'flex-1 border-r',
            )}>
            {reviewStageFilter ? (
              /* 棒次視角：跨分頁的扁平清單 */
              reviewStageRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center px-4 py-8">這一棒目前沒有項目</p>
              ) : (
                <>
                  <StageLensHeader stage={reviewStageFilter} viewer="accountable"
                    count={reviewStageRows.reduce((n, g) => n + g.rows.length, 0)} />
                  {renderFlowGroups(reviewStageRows)}
                </>
              )
            ) : reviewTab === 'pending' ? (
              reviewActionableRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center px-4 py-8">目前沒有待你處理的項目</p>
              ) : (
                renderFlowGroups(reviewActionableRows)
              )
            ) : reviewTab === 'members' ? (
              <div className="space-y-3 px-4 py-3">
                <WeekPicker value={reviewReportWeek} onChange={setReviewReportWeek} />
                {/* 依成員 / 依任務 切換 */}
                <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg w-fit">
                  {(['member', 'task'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setReviewMemberView(v)}
                      className={cn('px-3 py-1 text-xs rounded-md transition-colors', reviewMemberView === v ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                      {v === 'member' ? '依成員' : '依任務'}
                    </button>
                  ))}
                </div>
                {reviewMissingCount > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md px-2.5 py-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {reviewMemberView === 'task'
                      ? `本週有 ${reviewMissingCount} 個任務尚無人回報（依起訖與本週重疊判定）`
                      : `本週有 ${reviewMissingCount} 人應回報卻未送出週報`}
                  </div>
                )}

                {reviewMemberView === 'member' ? (
                  reviewWeekReport.memberRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">本週沒有應回報的成員</p>
                  ) : (
                    <div className="space-y-2">
                      {reviewWeekReport.memberRows.map(row => {
                        const mExpanded = reviewMemberExpanded.has(row.name)
                        return (
                          <div key={row.name} className="border rounded-lg overflow-hidden">
                            <div className={cn('px-3 py-2 flex items-center gap-2 cursor-pointer', row.missing ? 'bg-red-50 dark:bg-red-950/20' : 'bg-muted/20')}
                              onClick={() => setReviewMemberExpanded(prev => { const n = new Set(prev); if (n.has(row.name)) n.delete(row.name); else n.add(row.name); return n })}>
                              <FlowAvatar name={row.name} size={24} />
                              <span className="text-sm font-medium flex-1 truncate">{row.name}</span>
                              {row.missing ? (
                                <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400">未送出週報</Badge>
                              ) : row.expectedCount === 0 ? (
                                <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 text-muted-foreground" title="本週沒有指派給他、且起訖落在本週的任務">本週無應辦任務</Badge>
                              ) : (
                                <Badge variant="outline" className={cn('text-[11px] px-1.5 py-0.5', row.filledCount < row.expectedCount ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400')} title="分母＝本週應回報任務數（起訖與本週重疊），分子＝已填">
                                  本週應辦 {row.filledCount}/{row.expectedCount} 已填
                                </Badge>
                              )}
                              <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', mExpanded && 'rotate-180')} />
                            </div>
                            {mExpanded && (
                              <div className="border-t divide-y">
                                {row.tasks.map(ti => {
                                  return (
                                    <div key={ti.taskId}>
                                      <div
                                        className={cn('px-3 py-2 flex items-start gap-2 cursor-pointer transition-colors border-l-2',
                                          reviewFlowTaskId === ti.taskId ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/40')}
                                        onClick={() => selectReviewFlow(ti.taskId, 'logs')}
                                      >
                                        <div className="flex-1 min-w-0">
                                          {ti.ctx && <div className="text-[11px] text-muted-foreground/80 truncate">{ti.ctx}</div>}
                                          <div className="text-sm">{ti.title}</div>
                                        </div>
                                        {(() => {
                                          const f = reviewPipeline.byTask.get(ti.taskId)
                                          if (!f) return null
                                          return (
                                            <span className="flex items-center gap-1 shrink-0">
                                              <StageChip stage={f.stage} viewer="accountable" days={f.stuckDays} />
                                              {f.noReviewer && <AlertTriangle className="h-3 w-3 text-orange-600 dark:text-orange-400 shrink-0" aria-label="未設審核主管，由當責代審" />}
                                            </span>
                                          )
                                        })()}
                                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                ) : (
                  reviewWeekReport.taskTree.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">本週沒有進行中的任務</p>
                  ) : (
                    <div className="space-y-2">
                      {reviewWeekReport.taskTree.map(group => (
                        <div key={group.msId} className="border rounded-lg overflow-hidden">
                          <div className="px-3 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground">{group.msName}</div>
                          <div>{group.nodes.map(renderReviewTaskNode)}</div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            ) : (
              reviewShownHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">尚無處理履歷</p>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-muted/60"><tr className="text-muted-foreground">
                        <th className="text-left font-medium px-2 py-1.5 w-[96px] border-b">時間</th>
                        <th className="text-left font-medium px-2 py-1.5 border-b">任務</th>
                        <th className="text-left font-medium px-2 py-1.5 w-[104px] border-b">事件</th>
                        <th className="text-left font-medium px-2 py-1.5 w-[72px] border-b">操作人</th>
                      </tr></thead>
                      <tbody>
                        {reviewHistoryPageItems.map(ev => {
                          const meta = REVIEW_EVENT_META[ev.type] || { label: ev.type, cls: 'bg-muted text-muted-foreground border-border' }
                          const d = new Date(ev.createdAt)
                          return (
                            <tr key={ev.id} className="border-b border-border/40 last:border-b-0 align-top hover:bg-muted/30">
                              <td className="px-2 py-1.5 text-muted-foreground/80 whitespace-nowrap tabular-nums">{d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} {d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</td>
                              <td className="px-2 py-1.5 text-foreground/85 break-words">
                                {ev.path ? <span className="block text-[11px] text-muted-foreground/80 truncate">{ev.path}</span> : null}
                                {ev.taskTitle}
                                {ev.note ? <span className="mt-0.5 block text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-1.5 py-0.5">駁回原因：{ev.note}</span> : null}
                              </td>
                              <td className="px-2 py-1.5 align-top"><Badge variant="outline" className={cn('text-[11px] px-1.5 py-0.5 whitespace-nowrap', meta.cls)}>{meta.label}</Badge></td>
                              <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{ev.actor || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {reviewHistoryPageCount > 1 && (
                    <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={reviewHistoryClampedPage === 0} onClick={() => setReviewHistoryPage(p => Math.max(0, p - 1))}>
                        <ArrowLeft className="h-3.5 w-3.5" />上一頁
                      </Button>
                      <span className="tabular-nums">第 {reviewHistoryClampedPage + 1} / {reviewHistoryPageCount} 頁（共 {reviewShownHistory.length} 筆）</span>
                      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={reviewHistoryClampedPage >= reviewHistoryPageCount - 1} onClick={() => setReviewHistoryPage(p => Math.min(reviewHistoryPageCount - 1, p + 1))}>
                        下一頁<ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )
            )}
            </div>

            {/* ── 右欄：所選項目的完整審核流程 ── */}
            {reviewTab !== 'history' && !flowPanelOpen && (
              <ReviewFlowCollapsed onExpand={() => setFlowPanelOpen(true)} />
            )}
            {reviewTab !== 'history' && flowPanelOpen && (
              <div className="flex-1 min-w-0 flex flex-col bg-muted/10">
                {reviewSelectedFlow ? (
                  <ReviewFlowTimeline
                    key={reviewSelectedFlow.taskId}
                    className="animate-in fade-in slide-in-from-right-4 duration-200"
                    flow={reviewSelectedFlow}
                    viewer="accountable"
                    tab={flowTab}
                    onTabChange={setFlowTab}
                    onCollapse={() => setFlowPanelOpen(false)}
                    logsCount={reviewSelectedLogs.length}
                    logs={renderReviewLogs(toLogRows(reviewSelectedLogs))}
                    chainFilter={{
                      value: flowChainKey ?? 'all',
                      options: reviewChainInfo.chains,
                      onChange: v => setFlowChainKey(v === 'all' ? null : v),
                    }}
                    renderRevoke={(step) => {
                      // 完成後補充：當責撤的是「通過補充」那一棒，跟任務完成無關。
                      //   撤回後補充退出更新紀錄，回到當責待審（主管的核准保留）。
                      if (reviewSelectedFlow.supplement) {
                        if (step.key !== 'accountable' || reviewSelectedFlow.stage !== 'done') return null
                        if (!isWithinRevokeWindow(step.at)) return null
                        const rep2 = reviewSelectedApprovedSupplement
                        if (!rep2) return null
                        return (
                          <button type="button"
                            onClick={() => { setRevokeReason(''); setRevokeTarget({ kind: 'approval', projectId: rep2.projectId, authorId: rep2.authorId, taskId: rep2.taskId, title: reviewSelectedFlow.title, weekOf: rep2.weekOf, batch: rep2.batch, supplement: true, as: 'accountable', chainLabel: reviewChainInfo.chains.find(c => c.key === reviewChainInfo.activeKey)?.label ?? '完成後補充' }) }}
                            title="收回你對這筆補充的通過：補充退出更新紀錄，回到你的待審；主管的核准保留"
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive">
                            <Undo2 className="h-3 w-3" />撤回我的通過
                          </button>
                        )
                      }
                      // 當責只能撤回自己那一棒（確認完成）。流程未走到完成就沒得撤。
                      if (step.key !== 'complete' || reviewSelectedFlow.stage !== 'done') return null
                      // 超過一個月的完成確認不能撤回——甘特與里程碑無預警倒退的影響太大
                      if (!isWithinRevokeWindow(step.at)) return null
                      const proj = apiProjects.find(p => p.tasks.some(t => t.id === reviewSelectedFlow.taskId))
                      if (!proj) return null
                      return (
                        <button type="button"
                          onClick={() => { setRevokeReason(''); setRevokeTarget({ kind: 'confirm', projectId: proj.id, taskId: reviewSelectedFlow.taskId, title: reviewSelectedFlow.title }) }}
                          title="收回你在「完成 100%」做的確認：任務退回「待你處理」，執行者的回報保留"
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive">
                          <Undo2 className="h-3 w-3" />撤回我的確認
                        </button>
                      )
                    }}
                    actions={
                      // 代主管審報告：通過即納入更新紀錄（不代表任務完成）
                      (reviewSelectedFlow.pendingAction === 'review-report'
                        || reviewSelectedFlow.pendingAction === 'review-supplement') && reviewSelectedReport ? (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                            disabled={aReportBusy === reviewSelectedFlow.taskId}
                            onClick={() => { setAReportRejectReason(''); setAReportReject({ taskId: reviewSelectedFlow.taskId, title: reviewSelectedFlow.title }) }}>
                            <Undo2 className="h-3.5 w-3.5" />
                            {reviewSelectedFlow.pendingAction === 'review-supplement' ? '退回主管' : '駁回報告'}
                          </Button>
                          <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                            disabled={aReportBusy === reviewSelectedFlow.taskId}
                            onClick={() => aReviewReport('approve')}>
                            {aReportBusy === reviewSelectedFlow.taskId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleCheck className="h-3.5 w-3.5" />}
                            {reviewSelectedFlow.pendingAction === 'review-supplement' ? '通過補充並納入紀錄' : '通過並納入紀錄'}
                          </Button>
                        </div>
                      // 確認 R 回報的 100% 完成
                      ) : reviewSelectedFlow.pendingAction === 'confirm-done' && reviewSelectedItem ? (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                            disabled={reviewProcessing === reviewSelectedItem.task.id}
                            onClick={() => { setReviewRejectReason(''); setReviewRejectItem({ projectId: reviewSelectedItem.projectId, taskId: reviewSelectedItem.task.id, title: reviewSelectedItem.task.title }) }}>
                            <Undo2 className="h-3.5 w-3.5" />駁回
                          </Button>
                          <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                            disabled={reviewProcessing === reviewSelectedItem.task.id}
                            onClick={() => reviewConfirm(reviewSelectedItem)}>
                            {reviewProcessing === reviewSelectedItem.task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleCheck className="h-3.5 w-3.5" />}審核通過
                          </Button>
                        </div>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex justify-end border-b px-2 py-1.5 shrink-0">
                      <button type="button" onClick={() => setFlowPanelOpen(false)} title="收合右欄"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <PanelRightClose className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex-1 min-h-0">
                      <ReviewFlowEmpty counts={reviewPipeline.counts} viewer="accountable" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 駁回原因 */}
      <AlertDialog open={!!reviewRejectItem} onOpenChange={(open) => { if (!open) { setReviewRejectItem(null); setReviewRejectReason('') } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>駁回並退回重做？</AlertDialogTitle>
            <AlertDialogDescription>
              {reviewRejectItem && reviewFlowOf(reviewRejectItem.taskId)?.noReviewer
                ? <>任務「{reviewRejectItem.title}」會退回給執行者的「待完成」。</>
                : <>「{reviewRejectItem?.title}」的報告會<b>退回審核主管</b>重新審核，由主管決定是否再退給執行者。</>}
              {' '}執行者先前的「回報完成」會一併取消，需由他重新判斷後再次回報。
              {' '}請填寫原因讓對方知道要改什麼。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium flex items-center gap-1">
              駁回原因 <span className="text-destructive">*</span>
              {!reviewRejectReason.trim() && <span className="text-[11px] text-destructive font-normal">（必填）</span>}
            </label>
            <Textarea value={reviewRejectReason} onChange={e => setReviewRejectReason(e.target.value)} rows={3} placeholder="會記錄在審視歷程，並讓對方知道要改什麼…" className="text-sm" autoFocus />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 disabled:opacity-50 disabled:pointer-events-none"
              disabled={!reviewRejectReason.trim() || reviewProcessing === reviewRejectItem?.taskId}
              onClick={(e) => { e.preventDefault(); reviewDoReject() }}
            >確定駁回</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Help Dialog ── */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-3">
            <DialogTitle className="text-xl">我的任務說明</DialogTitle>
            <DialogDescription>依專案角色 (SAPRCI) 分頁顯示您參與的專案任務</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-blue-500" /> 頁面說明
              </h3>
              <p className="text-sm text-muted-foreground">
                最前面的<span className="text-blue-600 dark:text-blue-400 font-medium">「我的任務週報」</span>分頁，列出所有<span className="font-medium">有指派任務給您</span>的專案（不分角色），可在此填寫工作週報。
                其餘分頁依您在各專案中的<span className="text-blue-600 dark:text-blue-400 font-medium">專案角色 (SAPRCI)</span> 顯示，每個角色頁籤僅列出您擁有該角色的專案。
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-indigo-500" /> 各角色功能
              </h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">專案角色</th>
                      <th className="text-center px-3 py-2 font-medium">頁籤</th>
                      <th className="text-left px-3 py-2 font-medium">功能說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { role: '', label: '我的任務週報', desc: '填寫「被指派任務」的工作週報（不分角色）', color: 'text-blue-600 dark:text-blue-400', tab: true },
                      { role: 'S', label: '簽核', desc: '查看專案進度、前往審核中心審核延期', color: 'text-emerald-600 dark:text-emerald-400', tab: true },
                      { role: 'A', label: '當責', desc: '查看所有任務進度、查看成員週報、管理任務', color: 'text-amber-600 dark:text-amber-400', tab: true },
                      { role: 'P', label: '採購', desc: '查看及管理專案的預算項目與資本支出', color: 'text-purple-600 dark:text-purple-400', tab: true },
                      { role: 'R', label: '執行', desc: '執行任務；被指派任務時於「我的任務週報」填報', color: 'text-blue-600 dark:text-blue-400', tab: false },
                      { role: 'C', label: '諮詢', desc: '查看專案進度總覽（唯讀）', color: 'text-muted-foreground', tab: true },
                      { role: 'I', label: '知會', desc: '查看專案進度總覽（唯讀）', color: 'text-muted-foreground', tab: true },
                    ].map((r, i) => (
                      <tr key={r.label} className={i % 2 !== 0 ? 'bg-muted/20' : ''}>
                        <td className="px-3 py-2">
                          {r.role ? (
                            <>
                              <span className={cn('font-bold', r.color)}>{r.role}</span>
                              <span className="text-muted-foreground ml-1 text-xs">({r.label})</span>
                            </>
                          ) : (
                            <span className={cn('font-medium', r.color)}>{r.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.tab ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{r.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-amber-500" /> 操作說明
              </h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">操作</th>
                      <th className="text-center px-3 py-2 font-medium">S</th>
                      <th className="text-center px-3 py-2 font-medium">A</th>
                      <th className="text-center px-3 py-2 font-medium">P</th>
                      <th className="text-center px-3 py-2 font-medium">R</th>
                      <th className="text-center px-3 py-2 font-medium">C/I</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { op: '審核延期申請', S: true, A: false, P: false, R: false, CI: false },
                      { op: '查看所有任務進度', S: false, A: true, P: false, R: false, CI: false },
                      { op: '查看成員週報', S: false, A: true, P: false, R: false, CI: false },
                      { op: '管理預算/資本支出', S: false, A: false, P: true, R: false, CI: false },
                      { op: '填寫工作週報（有被指派任務時，不分角色）', S: true, A: true, P: true, R: true, CI: true },
                      { op: '查看專案概況', S: true, A: true, P: true, R: true, CI: true },
                      { op: '前往甘特圖', S: true, A: true, P: true, R: true, CI: true },
                    ].map((r, i) => (
                      <tr key={r.op} className={i % 2 !== 0 ? 'bg-muted/20' : ''}>
                        <td className="px-3 py-2 font-medium">{r.op}</td>
                        <td className="px-3 py-2 text-center">{r.S ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">✗</span>}</td>
                        <td className="px-3 py-2 text-center">{r.A ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">✗</span>}</td>
                        <td className="px-3 py-2 text-center">{r.P ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">✗</span>}</td>
                        <td className="px-3 py-2 text-center">{r.R ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">✗</span>}</td>
                        <td className="px-3 py-2 text-center">{r.CI ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">✗</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  )
}
