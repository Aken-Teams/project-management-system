'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { type Task, type TaskLog, type TaskLogAttachment, type SubTask, type Project } from '@/lib/mock-data'
import { VoiceInputButton } from '@/components/voice-input-button'
import { ProjectEditDialog, type ProjectEditData } from '@/components/project-edit-dialog'
import { WeekPicker } from '@/components/ui/week-picker'
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
  ChevronDown,
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
  pendingDelayMilestoneIds?: string[]
  pendingDelayProposedDates?: Record<string, string>
}

// 任務審視歷程事件
type RReviewEvent = { id: string; taskId: string; taskTitle: string; assignee: string; type: 'reported' | 'cancelled' | 'confirmed' | 'rejected' | string; actor: string; note?: string | null; createdAt: string; projectId?: string }

// 審核中心：一筆待審項目（logRows 含此任務 + 所有子任務的紀錄，附件掛在各列）
// R 報告審核主管收件匣型別（督導總覽：每 R 的待審 + 已審核 + 追蹤狀態）
type ReviewLogItem = { id: string; logDate: string; content: string; attachments: TaskLogAttachment[]; nextPlans: { date?: string; content: string }[]; status?: 'pending' | 'approved' | 'rejected' }
type ReviewSubmission = {
  taskId: string; taskTitle: string; weekOf: string | null
  reportedDone: boolean
  logs: ReviewLogItem[]
}
type ReviewedSubmission = {
  taskId: string; taskTitle: string; weekOf: string | null
  outcome: 'approved' | 'rejected'; note: string | null; reviewedAt: string
  logs: ReviewLogItem[]
}
type TrackingItem = {
  taskId: string; taskTitle: string; depth: number; owned: boolean; msName: string | null
  planStart: string; planEnd: string
  overdue: boolean; reportedDone: boolean; filled: boolean
  reviewState: 'none' | 'pending' | 'published' | 'rejected'
  logs: ReviewLogItem[]
}
type Reviewee = {
  authorId: string; authorName: string; authorEmail: string
  pending: ReviewSubmission[]; reviewed: ReviewedSubmission[]
  submittedThisWeek: boolean; openTaskCount: number
  tracking: TrackingItem[]
}
type ReviewProject = { projectId: string; projectName: string; reviewees: Reviewee[] }

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
type ReviewTaskNode = { taskId: string; title: string; assignee: string; depth: number; active: boolean; filled: boolean; reported: boolean; reviewed: boolean; logs: TaskLog[]; reviewState: ReportReviewState; children: ReviewTaskNode[] }

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

// 依姓名決定頭像底色（穩定、無隨機）
const REVIEW_AVATAR_COLORS = ['bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-orange-600']
function avatarColorFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return REVIEW_AVATAR_COLORS[h % REVIEW_AVATAR_COLORS.length]
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
}

export default function MyTasksPage() {
  const { user } = useAuth()

  const [apiProjects, setApiProjects] = useState<MyTasksProject[]>([])
  const [loading, setLoading] = useState(true)
  // R 報告審核主管收件匣（我要審核的成員報告）
  const [reviewInbox, setReviewInbox] = useState<ReviewProject[]>([])
  const [isReviewer, setIsReviewer] = useState(false) // 我是否為任何人的報告審核主管
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
  const [reportReviewExpanded, setReportReviewExpanded] = useState<Set<string>>(new Set())
  const toggleReportReviewExpand = (k: string) => setReportReviewExpanded(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s })
  const subKey = (projectId: string, authorId: string, s: ReviewSubmission) => `${projectId}:${authorId}:${s.taskId}:${s.weekOf ?? '_'}`
  const doReviewAction = async (projectId: string, authorId: string, s: ReviewSubmission, action: 'approve' | 'reject', note?: string) => {
    if (!user?.email) return
    setReviewBusy(subKey(projectId, authorId, s))
    try {
      const res = await fetch('/api/report-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewerEmail: user.email, projectId, taskId: s.taskId, authorId, weekOf: s.weekOf, action, note }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || '操作失敗'); return }
      toast.success(action === 'approve' ? '已核准，報告進入更新紀錄' : '已駁回，退回成員')
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
  interface RLogRow { date: string; content: string; existingLogId?: string; attachments?: TaskLogAttachment[]; updatedAt?: string; lastEditedBy?: string | null }
  const [rLogRows, setRLogRows] = useState<RLogRow[]>([{ date: '', content: '' }])
  const [rLogNextWeekPlan, setRLogNextWeekPlan] = useState('')
  const [rSubmittingBatch, setRSubmittingBatch] = useState(false)
  const [rTogglingDone, setRTogglingDone] = useState<string | null>(null)
  const [rDialogTab, setRDialogTab] = useState<'active' | 'pending' | 'done' | 'history'>('active')
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
  const [reviewExpanded, setReviewExpanded] = useState<Set<string>>(new Set())
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
  // 週報彈窗內的錯誤提示（改用彈跳視窗，不用 window.alert）
  const [rErrorMsg, setRErrorMsg] = useState<string | null>(null)
  // 過去週報預設唯讀，需按「編輯」才解鎖（避免誤改過去報告）
  const [rEditPastUnlocked, setREditPastUnlocked] = useState(false)
  // 完成區展開查看紀錄的任務
  const [rDoneExpanded, setRDoneExpanded] = useState<Set<string>>(new Set())
  const [rUploadingRowIdx, setRUploadingRowIdx] = useState<number | null>(null)
  const [rUploadProgress, setRUploadProgress] = useState<number>(0) // 0~100；0 或負值顯示為不確定進度
  const rRowFileInputRef = useRef<HTMLInputElement>(null)
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
    const base = myReportProjects.length > 0 ? ['MY', ...roleTabs] : roleTabs
    // 我是任何人的報告審核主管 → 常駐「審查報告」頁籤（即使暫無待審）
    return isReviewer ? [...base, 'REVIEW'] : base
  }, [userRolesMap, myReportProjects, isReviewer])

  // Auto-set initial active role
  useEffect(() => {
    if (availableRoles.length > 0 && !availableRoles.includes(activeRole)) {
      setActiveRole(availableRoles[0])
    }
  }, [availableRoles, activeRole])

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
    return {
      // 待完成：R 從「被指派那刻」起才看到 → 指派日 <= 該週結束日（與任務起訖無關）。
      // assignedAt 若缺（舊資料）則照舊顯示，不誤藏。
      rActiveGroups: build(t => !t.completedAt && !t.reportedDoneAt && (!t.assignedAt || t.assignedAt <= weekEnd), false),
      // 待確認：已回報、A 還沒審（未審核、未完成）
      rPendingGroups: build(t => !!t.reportedDoneAt && !t.completedAt && !t.reviewedAt, true),
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

  // 開啟某專案的週報審核
  const openReviewForProject = (projectId: string) => {
    setReviewProjectId(projectId)
    setReviewTab('pending')
    setReviewExpanded(new Set())
    setReviewMemberExpanded(new Set())
    setReviewHistoryPage(0)
    setReviewReportWeek(rCurrentMonday)
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
  type ReviewWeekTask = { taskId: string; title: string; ctx: string; active: boolean; filled: boolean; reported: boolean; reviewed: boolean; logs: TaskLog[]; reviewState: ReportReviewState }
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
    const weekLogs = p.taskLogs.filter(l => reportCountsForWeek({ weekOf: l.weekOf, logDate: l.logDate }, weekStart, weekEnd))
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
      return {
        taskId: t.id, title: t.title, assignee: t.assignee, depth,
        active: !!t.assignee && overlaps(t), filled: logs.length > 0, reported: !!t.reportedDoneAt, reviewed: !!t.reviewedAt, logs,
        reviewState: computeReportReviewState(logs),
        children: (childrenOf.get(t.id) || []).map(c => buildNode(c, depth + 1)),
      }
    }
    const taskTree = p.milestones.map(ms => {
      const tops = p.tasks.filter(t => showIds.has(t.id) && t.milestoneId === ms.id && (!t.parentId || !showIds.has(t.parentId)))
      return { msId: ms.id, msName: ms.name, nodes: tops.map(t => buildNode(t, 0)) }
    }).filter(g => g.nodes.length > 0)
    const missingTasks = activeTasks.filter(t => !(logsByTask.get(t.id)?.length)).length

    // 依成員：每人本週「該做的任務」(active) ∪「本週有寫的任務」，逐一標已填/未填
    const memberNames = new Set<string>()
    for (const t of activeTasks) memberNames.add(t.assignee)
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
          return { taskId: tid, title: t?.title || '任務', ctx: t ? ctxOf(tid) : '', active: !!t && t.assignee === name && overlaps(t), filled: logs.length > 0, reported: !!t?.reportedDoneAt, reviewed: !!t?.reviewedAt, logs, reviewState: computeReportReviewState(logs) }
        })
      const expectedCount = tasks.filter(ti => ti.active).length
      const filledCount = tasks.filter(ti => ti.active && ti.filled).length
      return { name, expectedCount, filledCount, missing: expectedCount > 0 && filledCount === 0, tasks }
    }).sort((a, b) => (a.missing === b.missing ? 0 : a.missing ? -1 : 1))
    const missingMembers = memberRows.filter(r => r.missing).length

    return { memberRows, taskTree, missingMembers, missingTasks }
  }, [apiProjects, reviewProjectId, reviewReportWeek])
  const reviewMissingCount = reviewMemberView === 'task' ? reviewWeekReport.missingTasks : reviewWeekReport.missingMembers

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

  // A 審核通過：認可 R 的報告 + 發布紀錄到更新紀錄。**不動進度/完成度**（避免甘特被誤設 100%）。
  const reviewConfirm = async (item: ReviewItem) => {
    if (!user) return
    setReviewProcessing(item.task.id)
    try {
      const res = await fetch(`/api/projects/${item.projectId}/tasks/${item.task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedDone: true, reviewEvent: 'confirmed', reviewActor: user.name }),
      })
      if (!res.ok) throw new Error()
      await refreshMyTasks()
    } catch { setRErrorMsg('審核失敗，請稍後再試') } finally { setReviewProcessing(null) }
  }

  // A 駁回（退回給執行者重做，附原因）
  const reviewDoReject = async () => {
    if (!user || !reviewRejectItem) return
    const it = reviewRejectItem
    setReviewProcessing(it.taskId)
    try {
      const res = await fetch(`/api/projects/${it.projectId}/tasks/${it.taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportedDone: false, reviewEvent: 'rejected', reviewActor: user.name, reviewNote: reviewRejectReason.trim() || undefined }),
      })
      if (!res.ok) throw new Error()
      setReviewRejectItem(null); setReviewRejectReason('')
      await refreshMyTasks()
    } catch { setRErrorMsg('駁回失敗，請稍後再試') } finally { setReviewProcessing(null) }
  }

  // 回報狀態徽章：區分「已回報完成（送 A 審核）」與「只是填了工作紀錄、還沒回報」
  const renderReviewStatus = (reported: boolean, reviewed: boolean): React.ReactNode => {
    if (reviewed) return <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400 shrink-0">已審核</Badge>
    if (reported) return <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 shrink-0">已回報待審</Badge>
    return <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 text-muted-foreground/70 shrink-0">未回報</Badge>
  }

  // A 視角：R主管審核狀態徽章。主管審核中時 hover 可看「是哪位主管、已等幾天」（A 才追得對人）。
  const renderReportReviewBadge = (st: ReportReviewState, active: boolean, count: number): React.ReactNode => {
    if (st.kind === 'pending' && st.reviewerName) {
      return (
        <HoverCard openDelay={80} closeDelay={100}>
          <HoverCardTrigger asChild>
            <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400 shrink-0 cursor-help">主管審核中{st.waitDays > 0 ? ` · ${st.waitDays}天` : ''}</Badge>
          </HoverCardTrigger>
          <HoverCardContent align="end" className="w-auto max-w-[220px] p-0 overflow-hidden">
            <div className="flex items-center gap-1.5 border-b border-blue-100 bg-blue-50 px-2.5 py-1.5 dark:border-blue-900 dark:bg-blue-950/40">
              <ClipboardList className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">報告審核中</span>
            </div>
            <div className="space-y-1 px-2.5 py-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">審核主管</span>
                <span className="font-medium">{st.reviewerName}</span>
              </div>
              <div className="text-muted-foreground">已等 {st.waitDays} 天 · 可去追主管審核</div>
            </div>
          </HoverCardContent>
        </HoverCard>
      )
    }
    if (st.kind === 'published') return <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400 shrink-0">已進紀錄</Badge>
    if (st.kind === 'rejected') return <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 shrink-0">已駁回</Badge>
    // pending 但無指定主管（fallback 由 A 直接處理）→ 沿用原本 已填/未填/非本週
    if (active) return st.kind === 'none'
      ? <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 shrink-0">未填</Badge>
      : <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400 shrink-0">已填 {count}</Badge>
    return <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 text-muted-foreground shrink-0" title="此任務起訖不在本週（提前/延後填寫）">非本週{count > 0 ? ` · 已填 ${count}` : ''}</Badge>
  }

  // 週報審核：某任務本週紀錄的小表格（日期／內容／附件）。附件＝icon+數量，hover 展開可下載清單。
  const renderReviewLogs = (logs: { id: string; logDate: string; content: string; attachments?: TaskLogAttachment[]; status?: 'pending' | 'approved' | 'rejected' }[]) => (
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
                {l.status === 'pending' && <span className="ml-1 inline-block rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1 text-[10px] align-middle">待審</span>}
                {l.status === 'approved' && <span className="ml-1 inline-block rounded bg-muted text-muted-foreground px-1 text-[10px] align-middle">已審</span>}
              </td>
              <td className="px-2 py-1.5 text-foreground/85 whitespace-pre-wrap break-words">{l.content}</td>
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
    const expanded = reviewMemberExpanded.has('task:' + node.taskId)
    return (
      <div key={node.taskId}>
        <div className="flex items-center gap-2 py-2 pr-3 border-b border-border/40 hover:bg-muted/20" style={{ paddingLeft: 12 + node.depth * 18 }}>
          {node.depth > 0 && <span className="text-muted-foreground/40 text-xs select-none shrink-0">└</span>}
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{node.title}</div>
            <div className="text-[11px] text-muted-foreground">負責人：{node.assignee || '未指派'}</div>
          </div>
          {renderReviewStatus(node.reported, node.reviewed)}
          {renderReportReviewBadge(node.reviewState, node.active, node.logs.length)}
          {node.logs.length > 0
            ? <button onClick={() => setReviewMemberExpanded(prev => { const k = 'task:' + node.taskId; const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })} className="shrink-0"><ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} /></button>
            : <span className="w-4 shrink-0" />}
        </div>
        {expanded && node.logs.length > 0 && renderReviewLogs(node.logs)}
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
  }

  // R dialog: file upload for batch log rows
  const handleRRowFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || rUploadingRowIdx === null) return
    const idx = rUploadingRowIdx
    const fileArray = Array.from(files)
    e.target.value = ''
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
                      const chaseN = proj.reviewees.filter(rv => rv.pending.length === 0 && !rv.submittedThisWeek && rv.openTaskCount > 0).length
                      return (
                        <tr key={proj.projectId} className="border-b last:border-0">
                          <td className="px-4 py-3 font-medium">{proj.projectName}</td>
                          <td className="px-4 py-3 text-center text-muted-foreground">{proj.reviewees.length} 位</td>
                          <td className="px-4 py-3 text-center">
                            {chaseN > 0 ? <Badge variant="destructive" className="text-xs">{chaseN} 人未送</Badge> : <span className="text-muted-foreground">-</span>}
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
        <Dialog open={!!reviewDialogProject} onOpenChange={(o) => { if (!o) { setReviewDialogProjectId(null); setReportReviewExpanded(new Set()) } }}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" />審核報告 — {reviewDialogProject?.projectName}</DialogTitle>
              <DialogDescription className="text-sm">點任一列展開看完整內容與附件。通過即進入更新紀錄；駁回可填原因退回成員。</DialogDescription>
            </DialogHeader>
            {(() => {
              if (!reviewDialogProject) return null
              const pRows = reviewDialogProject.reviewees.flatMap(rv => rv.pending.map(s => ({ rv, s })))
              const rRows = reviewDialogProject.reviewees.flatMap(rv => rv.reviewed.map(s => ({ rv, s })))
                .sort((a, b) => b.s.reviewedAt.localeCompare(a.s.reviewedAt))
              const pid = reviewDialogProject.projectId
              const keyOf = (authorId: string, taskId: string, weekOf: string | null) => `${pid}:${authorId}:${taskId}:${weekOf ?? '_'}`
              const trackMiss = reviewDialogProject.reviewees.reduce((n, rv) => n + rv.tracking.filter(t => t.owned && !t.filled).length, 0)
              return (
                <>
                  {/* Tab bar */}
                  <div className="px-5 flex gap-1 border-b">
                    {([
                      { val: 'pending', label: '待審核', cnt: pRows.length, tone: 'amber' },
                      { val: 'reviewed', label: '已審核', cnt: rRows.length, tone: 'muted' },
                      { val: 'tracking', label: '填報追蹤', cnt: trackMiss, tone: 'red' },
                    ] as const).map(({ val, label, cnt, tone }) => (
                      <button key={val} onClick={() => setReviewDialogTab(val)}
                        className={cn('px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
                          reviewDialogTab === val ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                        {label}
                        {cnt > 0 && <span className={cn('text-[11px] px-1.5 rounded-full tabular-nums',
                          tone === 'amber' ? 'bg-amber-500 text-white' : tone === 'red' ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground')}>{cnt}</span>}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                    {reviewDialogTab === 'tracking' ? (
                      <div className="space-y-3">
                        <div className="rounded-md border bg-muted/20 px-3 py-2.5">
                          <WeekPicker value={reviewTrackWeek} onChange={onTrackWeekChange} />
                        </div>
                        {trackMiss > 0 ? (
                          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />本週有 {trackMiss} 項任務尚未填報（逾期未完成也持續追蹤，直到任務完成）
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5 shrink-0" />本週督導成員皆已完成填報
                          </div>
                        )}
                        {reviewDialogProject.reviewees.every(rv => rv.tracking.length === 0) ? (
                          <p className="text-sm text-muted-foreground text-center py-8">本週沒有需追蹤的任務</p>
                        ) : reviewDialogProject.reviewees.filter(rv => rv.tracking.length > 0).map(rv => {
                          const miss = rv.tracking.filter(t => t.owned && !t.filled).length
                          return (
                            <div key={rv.authorId} className="rounded-lg border overflow-hidden">
                              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{rv.authorName.charAt(0)}</div>
                                <span className="text-sm font-medium flex-1 truncate">{rv.authorName}</span>
                                {miss > 0
                                  ? <Badge className="text-[11px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">{miss} 未填</Badge>
                                  : <Badge className="text-[11px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">全部已填</Badge>}
                              </div>
                              <div className="divide-y">
                                {rv.tracking.map(t => {
                                  const canExpand = t.owned && t.logs.length > 0
                                  const tk = `track:${rv.authorId}:${t.taskId}`
                                  const topen = reportReviewExpanded.has(tk)
                                  return (
                                    <div key={t.taskId}>
                                      <div
                                        className={cn('flex items-center gap-2 pr-3 py-2', canExpand && 'cursor-pointer hover:bg-muted/30')}
                                        style={{ paddingLeft: 12 + t.depth * 18 }}
                                        onClick={canExpand ? () => toggleReportReviewExpand(tk) : undefined}
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
                                            {t.overdue && <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400 shrink-0">逾期</Badge>}
                                            {t.reportedDone && <Badge className="text-[11px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">100%</Badge>}
                                            {t.reviewState === 'pending'
                                              ? <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400 shrink-0">審核中</Badge>
                                              : t.reviewState === 'published'
                                                ? <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/20 dark:text-emerald-400 shrink-0">已通過</Badge>
                                                : t.reviewState === 'rejected'
                                                  ? <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 shrink-0">已駁回</Badge>
                                                  : t.filled
                                                    ? <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/20 dark:text-emerald-400 shrink-0">已填</Badge>
                                                    : <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 shrink-0">未填</Badge>}
                                          </>
                                        )}
                                        {canExpand
                                          ? <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', topen && 'rotate-180')} />
                                          : <span className="w-4 shrink-0" />}
                                      </div>
                                      {canExpand && topen && (
                                        <div className="border-t bg-muted/10" style={{ paddingLeft: 12 + t.depth * 18 }}>
                                          {renderReviewLogs(t.logs)}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : reviewDialogTab === 'pending' ? (
                      pRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">目前沒有待審核的報告</p>
                      ) : pRows.map(({ rv, s }) => {
                        const k = keyOf(rv.authorId, s.taskId, s.weekOf)
                        const open = reportReviewExpanded.has(k)
                        const busy = reviewBusy === subKey(pid, rv.authorId, s)
                        const brief = s.logs.map(l => l.content).join('；')
                        return (
                          <div key={k} className="rounded-lg border overflow-hidden">
                            <button onClick={() => toggleReportReviewExpand(k)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{rv.authorName.charAt(0)}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{rv.authorName}</span>
                                  <span className="text-xs text-muted-foreground truncate">{s.taskTitle}</span>
                                  {s.reportedDone && <Badge className="text-[11px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">100%</Badge>}
                                </div>
                                {!open && <div className="text-xs text-muted-foreground truncate mt-0.5" title={brief}>{brief}</div>}
                              </div>
                              {s.weekOf && <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap" title="此報告的填報週">{formatReportWeek(s.weekOf)}</span>}
                              <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
                            </button>
                            {open && (
                              <div className="px-3 pb-3 space-y-2 border-t bg-muted/10">
                                {renderReviewLogs(s.logs)}
                                <div className="flex items-center justify-end gap-2">
                                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                                    disabled={busy} onClick={() => { setRejectTarget({ projectId: pid, authorId: rv.authorId, authorName: rv.authorName, sub: s }); setRejectReason('') }}>
                                    <X className="h-3.5 w-3.5" />駁回
                                  </Button>
                                  <Button size="sm" className="h-7 text-xs gap-1" disabled={busy}
                                    onClick={() => doReviewAction(pid, rv.authorId, s, 'approve')}>
                                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}通過
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      rRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">尚無已審核的報告</p>
                      ) : rRows.map(({ rv, s }) => {
                        const k = keyOf(rv.authorId, s.taskId, s.weekOf)
                        const open = reportReviewExpanded.has(k)
                        const brief = s.logs.map(l => l.content).join('；')
                        return (
                          <div key={k} className="rounded-lg border overflow-hidden">
                            <button onClick={() => toggleReportReviewExpand(k)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{rv.authorName.charAt(0)}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{rv.authorName}</span>
                                  <span className="text-xs text-muted-foreground truncate">{s.taskTitle}</span>
                                  {s.outcome === 'approved'
                                    ? <Badge className="text-[11px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">已通過</Badge>
                                    : <Badge className="text-[11px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">已駁回</Badge>}
                                </div>
                                {!open && <div className="text-xs text-muted-foreground truncate mt-0.5" title={brief}>{s.outcome === 'rejected' && s.note ? `駁回原因：${s.note}` : brief}</div>}
                              </div>
                              {s.weekOf && <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap" title="此報告的填報週">{formatReportWeek(s.weekOf)}</span>}
                              <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
                            </button>
                            {open && (
                              <div className="px-3 pb-3 space-y-2 border-t bg-muted/10">
                                {s.outcome === 'rejected' && s.note && (
                                  <div className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1.5">駁回原因：{s.note}</div>
                                )}
                                {renderReviewLogs(s.logs)}
                              </div>
                            )}
                          </div>
                        )
                      })
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
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="text-base">填寫週報</DialogTitle>
            {rReportDialogProject && (
              <DialogDescription className="text-sm">
                {rReportDialogProject.name} — 選擇任務填寫工作紀錄
              </DialogDescription>
            )}
          </DialogHeader>
          {rReportDialogProject && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
                    title="已回報完成、等待確認的任務"
                  >
                    待確認
                    {rPendingCount > 0 && (
                      <span className="text-[11px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">{rPendingCount}</span>
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
                                            <tr key={idx} className="border-b border-border last:border-b-0">
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
                                                    setRUploadingRowIdx(idx)
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
                              <th className="text-left font-medium px-2 py-1.5 w-[92px] border-b">事件</th>
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
                                    {ev.taskTitle}
                                    {ev.note ? <span className="mt-0.5 block text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-1.5 py-0.5">退回原因：{ev.note}</span> : null}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <Badge variant="outline" className={cn('text-[11px] px-1.5 py-0.5', meta.cls)}>{meta.label}</Badge>
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
                  (rDialogTab === 'pending' ? rPendingGroups : rDoneGroups).length === 0 ? (
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
                              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/60 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                            >
                              <span className={cn('h-2 w-2 rounded-full shrink-0', (aDone || task.reviewedAt) ? 'bg-green-500' : 'bg-amber-500')} />
                              <span className="text-sm flex-1 truncate text-muted-foreground">{task.title}</span>
                              <span className="text-xs tabular-nums text-muted-foreground/70 shrink-0">{fmtMD(task.startDate)} → {fmtMD(task.endDate)}</span>
                              {aDone ? (
                                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 text-[11px] px-1.5 py-0.5 shrink-0" title={task.completedBy ? `由 ${task.completedBy} 確認完成` : undefined}>
                                  <Check className="h-3 w-3 mr-0.5" />已完成
                                </Badge>
                              ) : task.reviewedAt ? (
                                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 text-[11px] px-1.5 py-0.5 shrink-0" title="當責已審核通過你的回報（是否算完成由當責在報告中決定）">
                                  <Check className="h-3 w-3 mr-0.5" />已審核通過
                                </Badge>
                              ) : (
                                <span className="flex items-center gap-1 shrink-0">
                                  <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 text-[11px] px-1.5 py-0.5" title="已回報完成，等待確認">
                                    <Check className="h-3 w-3 mr-0.5" />待確認
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
                              )}
                              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-180')} />
                            </div>
                            {expanded && (
                              <div className="mt-1.5 rounded-lg border border-border/60 overflow-hidden">
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
                                            <td className="px-2 py-1.5 text-foreground/85 whitespace-pre-wrap break-words">{l.content}</td>
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

      {/* ── 審核中心（當責 A）── */}
      <Dialog open={reviewCenterOpen} onOpenChange={setReviewCenterOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" />週報審核{reviewShownName ? ` — ${reviewShownName}` : ''}</DialogTitle>
            <DialogDescription className="text-sm">審核執行者的回報：<b>審核通過</b>＝認可內容並把紀錄發布到「更新紀錄」（<b>不代表任務 100% 完成</b>，完成與否由你在報告中決定）；或駁回退回重做。</DialogDescription>
          </DialogHeader>
          <div className="px-6 pt-3">
            <div className="flex items-center gap-1 border-b">
              <button type="button" onClick={() => setReviewTab('pending')}
                className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors flex items-center gap-1',
                  reviewTab === 'pending' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                待你確認
                {reviewShownItems.length > 0 && <span className="text-[11px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">{reviewShownItems.length}</span>}
              </button>
              <button type="button" onClick={() => setReviewTab('members')}
                className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors flex items-center gap-1',
                  reviewTab === 'members' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
                title="依週別查看所有人的週報，並看出誰沒送出">
                成員週報
                {reviewMissingCount > 0 && <span className="text-[11px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full px-1.5 py-0.5">{reviewMissingCount}</span>}
              </button>
              <button type="button" onClick={() => setReviewTab('history')}
                className={cn('px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors',
                  reviewTab === 'history' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                已處理履歷
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {reviewTab === 'pending' ? (
              reviewShownItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">目前沒有待你確認的項目</p>
              ) : (
                <div className="space-y-2.5">
                  {reviewShownItems.map(item => {
                    const expanded = reviewExpanded.has(item.task.id)
                    const busy = reviewProcessing === item.task.id
                    return (
                      <div key={item.task.id} className="border rounded-lg overflow-hidden">
                        <div className="px-3 py-2.5 bg-muted/20">
                          {!reviewProjectId && <div className="text-[11px] text-muted-foreground/70 truncate">{item.projectName}</div>}
                          <div className="text-[11px] text-muted-foreground truncate">{item.path}</div>
                          <div className="flex items-start gap-2 mt-0.5">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold truncate">{item.task.title}</div>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                <span className="inline-flex items-center gap-1">
                                  <Avatar className="h-5 w-5"><AvatarFallback className={cn('text-[11px] text-white', avatarColorFor(item.reporter || '?'))}>{(item.reporter || '?').split(' ').map(n => n[0]).join('')}</AvatarFallback></Avatar>
                                  <span className="text-xs text-foreground/80">{item.reporter || '執行者'}</span>
                                </span>
                                <Badge variant="outline" className="text-[11px] px-1.5 py-0 gap-1 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700">
                                  <Check className="h-3 w-3" />回報完成 {new Date(item.reportedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                </Badge>
                                {item.fileCount > 0 && (
                                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 gap-1 text-muted-foreground">
                                    <Paperclip className="h-3 w-3" />{item.fileCount} 個附件
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 shrink-0"
                              onClick={() => setReviewExpanded(prev => { const n = new Set(prev); if (n.has(item.task.id)) n.delete(item.task.id); else n.add(item.task.id); return n })}>
                              <FileText className="h-3.5 w-3.5" />看紀錄<ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                            </Button>
                          </div>
                          <div className="flex items-center justify-end gap-2 mt-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                              disabled={busy} onClick={() => { setReviewRejectReason(''); setReviewRejectItem({ projectId: item.projectId, taskId: item.task.id, title: item.task.title }) }}>
                              <Undo2 className="h-3.5 w-3.5" />駁回
                            </Button>
                            <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                              disabled={busy} onClick={() => reviewConfirm(item)}>
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleCheck className="h-3.5 w-3.5" />}審核通過
                            </Button>
                          </div>
                        </div>
                        {expanded && (
                          <div className="border-t bg-background">
                            {item.logRows.length === 0 ? (
                              <p className="text-xs text-muted-foreground/60 px-3 py-3 text-center">此任務尚無工作紀錄</p>
                            ) : (
                              <div className="max-h-[240px] overflow-y-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur"><tr className="text-muted-foreground">
                                    <th className="text-left font-medium px-2 py-1.5 w-[56px] border-b">日期</th>
                                    <th className="text-left font-medium px-2 py-1.5 w-[76px] border-b">填寫人</th>
                                    <th className="text-left font-medium px-2 py-1.5 border-b">工作內容</th>
                                    <th className="text-center font-medium px-2 py-1.5 w-[44px] border-b">附件</th>
                                  </tr></thead>
                                  <tbody>
                                    {item.logRows.map(({ log: l, srcTitle }) => (
                                      <tr key={l.id} className="border-b border-border/40 last:border-b-0 align-top hover:bg-muted/30">
                                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap">{new Date(l.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</td>
                                        <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{l.author}</td>
                                        <td className="px-2 py-1.5 text-foreground/85 whitespace-pre-wrap break-words">
                                          {srcTitle && <Badge variant="outline" className="text-[11px] px-1 py-0 mr-1 align-middle text-amber-600 border-amber-300">子：{srcTitle}</Badge>}
                                          {l.content}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          {l.attachments && l.attachments.length > 0 ? (
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <button className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:bg-primary/10 rounded px-1.5 py-0.5"><Paperclip className="h-3 w-3" />{l.attachments.length}</button>
                                              </PopoverTrigger>
                                              <PopoverContent align="end" className="w-60 p-2">
                                                <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                                                  {l.attachments.map((att, ai) => (
                                                    <a key={ai} href={att.url} download={att.name} target="_blank" rel="noopener" className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted text-xs">
                                                      {att.type === 'image' ? <img src={att.url} alt={att.name} className="h-8 w-8 rounded object-cover border shrink-0" /> : <span className="h-8 w-8 rounded border bg-muted flex items-center justify-center shrink-0"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                                                      <span className="truncate flex-1">{att.name}</span>
                                                    </a>
                                                  ))}
                                                </div>
                                              </PopoverContent>
                                            </Popover>
                                          ) : <span className="text-muted-foreground/30">—</span>}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            ) : reviewTab === 'members' ? (
              <div className="space-y-3">
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
                              <Avatar className="h-6 w-6"><AvatarFallback className={cn('text-[11px] text-white', avatarColorFor(row.name))}>{row.name.split(' ').map(n => n[0]).join('')}</AvatarFallback></Avatar>
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
                                  const tKey = `mtask:${row.name}:${ti.taskId}`
                                  const tExpanded = reviewMemberExpanded.has(tKey)
                                  const hasLogs = ti.logs.length > 0
                                  return (
                                    <div key={ti.taskId}>
                                      <div
                                        className={cn('px-3 py-2 flex items-start gap-2', hasLogs && 'cursor-pointer hover:bg-muted/20')}
                                        onClick={hasLogs ? () => setReviewMemberExpanded(prev => { const n = new Set(prev); if (n.has(tKey)) n.delete(tKey); else n.add(tKey); return n }) : undefined}
                                      >
                                        <div className="flex-1 min-w-0">
                                          {ti.ctx && <div className="text-[11px] text-muted-foreground/80 truncate">{ti.ctx}</div>}
                                          <div className="text-sm">{ti.title}</div>
                                        </div>
                                        {renderReviewStatus(ti.reported, ti.reviewed)}
                                        {renderReportReviewBadge(ti.reviewState, ti.active, ti.logs.length)}
                                        {hasLogs
                                          ? <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform mt-0.5', tExpanded && 'rotate-180')} />
                                          : <span className="w-4 shrink-0" />}
                                      </div>
                                      {hasLogs && tExpanded && renderReviewLogs(ti.logs)}
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
                        <th className="text-left font-medium px-2 py-1.5 w-[84px] border-b">事件</th>
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
                                {ev.taskTitle}
                                {ev.note ? <span className="mt-0.5 block text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-1.5 py-0.5">駁回原因：{ev.note}</span> : null}
                              </td>
                              <td className="px-2 py-1.5"><Badge variant="outline" className={cn('text-[11px] px-1.5 py-0.5', meta.cls)}>{meta.label}</Badge></td>
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
        </DialogContent>
      </Dialog>

      {/* 駁回原因 */}
      <AlertDialog open={!!reviewRejectItem} onOpenChange={(open) => { if (!open) { setReviewRejectItem(null); setReviewRejectReason('') } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>駁回並退回重做？</AlertDialogTitle>
            <AlertDialogDescription>
              任務「{reviewRejectItem?.title}」會退回給執行者的「待完成」，請填寫駁回原因讓對方知道要改什麼。
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
