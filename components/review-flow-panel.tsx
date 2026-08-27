'use client'

/**
 * 審核流程視覺化 —— 把散落的狀態徽章還原成「一條流水線」。
 *
 * 流程是動態的，不是固定四棒。畫錯會讓 A 以為自己還有事要做：
 *
 *   一般週報（R 沒按「回報完成」）：
 *     ① R 填週報 ──▶ ② R主管審核 ──▶ ③ 納入更新紀錄（本週到此結束，任務繼續跑）
 *
 *   R 按了「回報完成」：
 *     ① R 填週報 ──▶ ② R主管審核 ──▶ ③ 當責 A 確認 ──▶ ④ 完成 100%
 *
 *   該成員沒設報告審核主管時，②那一棒不存在——後端送出報告時就 fallback 通知當責
 *   （task-logs/batch: routedTo='accountable'），也就是「A 代審」。此時若還畫成
 *   「主管審核中」，畫面會永遠等一個不存在的人。改為明確標示「未設主管，由當責代審」。
 *
 * 本檔提供三樣東西，兩個對話框（A 的「週報審核」、主管的「審核報告」）共用：
 *   - deriveFlowStage() 單一真相：一個任務現在卡在哪一棒
 *   - <ReviewPipelineBar>  流程總覽列：一眼看出各棒次積了幾件，可點擊篩選
 *   - <ReviewFlowTimeline> 單筆流程時間軸：每個環節誰做的、何時、卡幾天、下一棒給誰
 */

import { Fragment } from 'react'
import {
  Check, ChevronRight, CircleDot, Clock, FileText, Paperclip,
  Undo2, UserRound, Flag, Circle, MinusCircle, TriangleAlert, X,
  PanelRightClose, PanelRightOpen, GitBranch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isReportVisible } from '@/lib/report-cutoff'
import { Badge } from '@/components/ui/badge'

// ─────────────────────────────────────────────────────────
// 型別
// ─────────────────────────────────────────────────────────

/** 流水線上的棒次。running＝正常進行中（沒人卡著，不需催）。 */
export type FlowStage = 'unfilled' | 'supervisor' | 'accountable' | 'done' | 'running'

/** 時間軸上單一環節的狀態。skipped＝此流程沒有這一棒。 */
export type FlowStepState = 'done' | 'current' | 'rejected' | 'todo' | 'skipped'

export interface FlowStep {
  key: 'report' | 'supervisor' | 'no-reviewer' | 'record' | 'accountable' | 'complete'
  /** 環節名稱，例：「R 填報週報」 */
  label: string
  state: FlowStepState
  /** 這一棒的角色說明，例：「執行者 R」 */
  roleLabel: string
  /** 已完成＝經手人；進行中＝正在等誰。null＝只知角色不知人名 */
  who: string | null
  /** 完成時間（ISO） */
  at?: string | null
  /** 補充說明（週別、附件數、下一步會發生什麼…） */
  detail?: string | null
  /** 駁回原因 */
  note?: string | null
  /** 卡在這一棒幾天 */
  waitDays?: number
  /** 步驟上的提醒徽章，例：未設主管 */
  warn?: string
}

export interface ReviewFlow {
  taskId: string
  title: string
  /** 里程碑 › 父任務 麵包屑 */
  path?: string | null
  stage: FlowStage
  /** 下一棒在誰手上；null＝已完成或無人卡。who 可為 null（只知角色） */
  ballWith: { who: string | null; roleLabel: string } | null
  steps: FlowStep[]
  attachments: number
  /** 目前這一棒已經卡了幾天 */
  stuckDays: number
  assignee: string
  /** 此成員未設報告審核主管（＝由當責代審），供清單加註 */
  noReviewer: boolean
  /** 這條流程描述的是哪一份報告（填報週標籤）。null＝尚無報告 */
  reportWeekLabel: string | null
  /**
   * 目前輪到當責時，要做的是哪一種動作：
   *   review-report＝審核報告（代主管，通過即納入更新紀錄）
   *   confirm-done ＝確認 R 回報的 100% 完成
   */
  pendingAction: 'review-report' | 'confirm-done' | null
}

export interface FlowSourceTask {
  id: string
  title: string
  assignee?: string
  status?: string
  completedAt?: string | null
  completedBy?: string | null
  reportedDoneAt?: string | null
  reportedDoneBy?: string | null
  reviewedAt?: string | null
  reviewedBy?: string | null
}

export interface FlowSourceLog {
  id: string
  author: string
  logDate: string
  createdAt?: string
  weekOf?: string | null
  publishedAt?: string | null
  reviewerRejectedAt?: string | null
  reviewerNote?: string | null
  authorReviewerName?: string | null
  attachments?: { name: string; url: string; type: 'image' | 'file' }[] | null
}

export interface FlowSourceEvent {
  type: string
  actor: string
  note?: string | null
  createdAt: string
}

// ─────────────────────────────────────────────────────────
// 棒次定義（顏色語意：看顏色就知道球在誰手上）
// ─────────────────────────────────────────────────────────

export interface StageMeta {
  key: FlowStage
  /** A 視角的稱呼 */
  label: string
  /** R主管視角的稱呼 */
  supLabel: string
  /** R（執行者）視角的稱呼 */
  exeLabel: string
  /** 誰該動 */
  owner: string
  dot: string
  chip: string
  ring: string
}

export const STAGE_META: Record<FlowStage, StageMeta> = {
  unfilled: {
    key: 'unfilled', label: '待 R 填報', supLabel: '成員未填報', exeLabel: '待你填報', owner: '執行者 R',
    dot: 'bg-red-500',
    chip: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
    ring: 'ring-red-500/40',
  },
  supervisor: {
    key: 'supervisor', label: '主管審核中', supLabel: '待你審核', exeLabel: '主管審核中', owner: '報告審核主管',
    dot: 'bg-blue-500',
    chip: 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
    ring: 'ring-blue-500/40',
  },
  accountable: {
    key: 'accountable', label: '待你處理', supLabel: '已送當責確認', exeLabel: '當責審核中', owner: '當責 A',
    dot: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
    ring: 'ring-amber-500/40',
  },
  running: {
    key: 'running', label: '執行中', supLabel: '執行中', exeLabel: '進行中', owner: '執行者 R',
    dot: 'bg-slate-300 dark:bg-slate-600',
    chip: 'bg-muted/60 text-muted-foreground border-border',
    ring: 'ring-slate-400/30',
  },
  done: {
    key: 'done', label: '已完成', supLabel: '已完成', exeLabel: '已完成', owner: '—',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
    ring: 'ring-emerald-500/40',
  },
}

/** 流程總覽列的顯示順序（running 不佔位，併入「執行中」尾巴） */
export const PIPELINE_ORDER: FlowStage[] = ['unfilled', 'supervisor', 'accountable', 'done']

export type FlowViewer = 'accountable' | 'supervisor' | 'executor'

export function stageLabel(stage: FlowStage, viewer: FlowViewer): string {
  const m = STAGE_META[stage]
  return viewer === 'supervisor' ? m.supLabel : viewer === 'executor' ? m.exeLabel : m.label
}

// ─────────────────────────────────────────────────────────
// 推導
// ─────────────────────────────────────────────────────────

const DAY = 86400000
const daysSince = (iso: string | null | undefined): number =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : 0

/** 把填報週(週一 YYYY-MM-DD)寫成「2026W30 · 7/20~7/26」。 */
export function formatWeekLabel(monday: string | null | undefined): string | null {
  if (!monday) return null
  const [y, m, d] = monday.split('-').map(Number)
  if (!y || !m || !d) return null
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 6)
  const md = (dt: Date) => `${dt.getMonth() + 1}/${dt.getDate()}`
  const iso = new Date(Date.UTC(y, m - 1, d))
  const dayNum = iso.getUTCDay() || 7
  iso.setUTCDate(iso.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(iso.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((iso.getTime() - yearStart.getTime()) / DAY + 1) / 7)
  return `${iso.getUTCFullYear()}W${String(week).padStart(2, '0')} · ${md(start)}~${md(end)}`
}

const fmtDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
}

const fmtDateTime = (iso: string | null | undefined): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })} ${d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
}

/** 報告審核（R主管那一棒）的狀態。legacy＝靠 7/12 舊資料寬限而已在更新紀錄中。 */
type ReportKind = 'none' | 'pending' | 'published' | 'rejected'
type ReportState = { kind: ReportKind; reviewer: string | null; since: string | null; legacy: boolean }

function reportStateOf(logs: FlowSourceLog[]): ReportState {
  if (logs.length === 0) return { kind: 'none', reviewer: null, since: null, legacy: false }

  // 「是否已在更新紀錄中」一律以 isReportVisible() 為準，與其他 8 處濾鏡共用同一套判定。
  //   7/12 前建檔的舊資料（客戶匯入、從未走過送出流程）本來就照顯示，
  //   若這裡只看 publishedAt，就會把它們算成「待審」，逼 A 去審一批早就看得到的東西。
  const pending = logs.filter(l => !l.reviewerRejectedAt && !isReportVisible(l))
  if (pending.length > 0) {
    const reviewer = pending.map(l => l.authorReviewerName).find(Boolean) ?? null
    const since = pending.reduce<string | null>((min, l) => {
      const t = l.createdAt ?? l.logDate
      return !min || t < min ? t : min
    }, null)
    return { kind: 'pending', reviewer, since, legacy: false }
  }

  const visible = logs.filter(l => isReportVisible(l))
  if (visible.length > 0) {
    const realPublished = visible.filter(l => l.publishedAt)
    const at = realPublished.reduce<string | null>((max, l) => (!max || (l.publishedAt ?? '') > max ? l.publishedAt! : max), null)
    return {
      kind: 'published',
      reviewer: realPublished.map(l => l.authorReviewerName).find(Boolean) ?? null,
      since: at,
      legacy: realPublished.length === 0, // 全靠寬限才顯示 → 沒有人真的按過核准
    }
  }

  const at = logs.reduce<string | null>((max, l) => (!max || (l.reviewerRejectedAt ?? '') > max ? l.reviewerRejectedAt! : max), null)
  return { kind: 'rejected', reviewer: logs.map(l => l.authorReviewerName).find(Boolean) ?? null, since: at, legacy: false }
}

/**
 * 單一真相：這個任務現在卡在哪一棒。
 *
 * hasReviewer=false 時「主管審核中」那一棒不存在——後端在報告送出時就已 fallback
 * 通知當責（routedTo='accountable'）。若仍判成 supervisor，畫面會永遠等一個不存在的人，
 * 而 A 也不知道球其實在自己手上。
 */
export function deriveFlowStage(opts: {
  completed: boolean
  reportedDone: boolean
  reportKind: ReportKind
  /** 本週是否該填報（active） */
  activeThisWeek: boolean
  /** 該成員是否有指定報告審核主管 */
  hasReviewer: boolean
}): FlowStage {
  if (opts.completed) return 'done'
  if (opts.reportKind === 'pending') return opts.hasReviewer ? 'supervisor' : 'accountable'
  if (opts.reportedDone) return 'accountable'
  if (opts.reportKind === 'rejected') return 'unfilled'
  if (opts.activeThisWeek && opts.reportKind === 'none') return 'unfilled'
  return 'running'
}

// ── 共用的步驟組裝（raw logs 版與 summary 版共用同一套文案與規則）──

interface StepBuildInput {
  reportKind: ReportKind
  /** 已進更新紀錄，但是靠 7/12 舊資料寬限，而非真的有人核准 */
  legacy?: boolean
  hasReviewer: boolean
  reportedDone: boolean
  completed: boolean
  activeThisWeek: boolean
  overdue?: boolean
  assignee: string
  stage: FlowStage
  /** ① 填報 */
  submittedAt: string | null
  reportDetail: string | null
  /** ② 主管審核 */
  reviewerName: string | null
  decidedAt: string | null
  rejectNote: string | null
  /** ③ 當責確認 */
  accountableName: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  reportedDoneAt: string | null
  aReject: { actor: string; note: string | null; at: string } | null
  /** ④ 完成 */
  completedAt: string | null
  completedBy: string | null
  /** 主管視角時文案要改成第二人稱 */
  viewerIsReviewer: boolean
}

function buildSteps(i: StepBuildInput): FlowStep[] {
  const steps: FlowStep[] = []

  // ① R 填報週報
  steps.push(i.reportKind !== 'none'
    ? {
      key: 'report', label: 'R 填報週報', roleLabel: '', state: 'done',
      who: i.assignee || null, at: i.submittedAt, detail: i.reportDetail,
    }
    : {
      key: 'report', label: 'R 填報週報', roleLabel: '',
      state: i.activeThisWeek ? 'current' : 'todo', who: i.assignee || null,
      detail: i.activeThisWeek ? (i.overdue ? '逾期未交' : '本週未交') : null,
    })

  // ② 報告審核。沒指定主管時這一棒由當責代打——不是「略過」，球是真的在 A 手上。
  if (!i.hasReviewer) {
    const common = { key: 'supervisor' as const, label: '當責 A 審核報告', roleLabel: '當責 A（代主管）', warn: '未設主管' }
    if (i.reportKind === 'pending') {
      steps.push({
        ...common, state: 'current', who: i.accountableName, waitDays: daysSince(i.submittedAt),
        detail: '此成員未設主管，報告由你審核；通過即納入更新紀錄',
      })
    } else if (i.reportKind === 'published') {
      steps.push({ ...common, state: 'done', who: i.reviewerName, at: i.decidedAt,
        detail: i.legacy ? '7/12 前的舊資料，已在更新紀錄中（未經審核流程）' : '已通過，進入更新紀錄' })
    } else if (i.reportKind === 'rejected') {
      steps.push({ ...common, state: 'rejected', who: i.reviewerName, at: i.decidedAt, note: i.rejectNote, detail: '已退回重寫' })
    } else {
      steps.push({ ...common, state: 'todo', who: i.accountableName, detail: null })
    }
  } else if (i.reportKind === 'pending') {
    steps.push({
      key: 'supervisor', label: 'R主管審核', roleLabel: '', state: 'current',
      who: i.reviewerName, waitDays: daysSince(i.submittedAt),
      detail: i.viewerIsReviewer ? '你核准後進入更新紀錄' : '待主管核准',
    })
  } else if (i.reportKind === 'published') {
    steps.push({
      key: 'supervisor', label: 'R主管審核', roleLabel: '', state: 'done',
      who: i.reviewerName, at: i.decidedAt,
      detail: i.legacy ? '7/12 前的舊資料，已在更新紀錄中（未經審核流程）' : '已核准，進入更新紀錄',
    })
  } else if (i.reportKind === 'rejected') {
    steps.push({
      key: 'supervisor', label: 'R主管審核', roleLabel: '', state: 'rejected',
      who: i.reviewerName, at: i.decidedAt, note: i.rejectNote,
      detail: '已退回重寫',
    })
  } else {
    steps.push({
      key: 'supervisor', label: 'R主管審核', roleLabel: '', state: 'todo',
      who: i.reviewerName, detail: null,
    })
  }

  // ③ 分岔：R 沒按「回報完成」= 一般週報，流程到「納入更新紀錄」就結束，
  //    不該畫「當責確認 / 完成 100%」——那會讓 A 以為自己還有事沒做。
  const goesToAccountable = i.reportedDone || i.completed || !!i.reviewedAt
  if (!goesToAccountable) {
    if (i.reportKind === 'published') {
      steps.push({
        key: 'record', label: '納入更新紀錄', roleLabel: '本週流程終點', state: 'done', who: null,
        detail: i.legacy ? '舊資料已在更新紀錄中。任務續行，下週繼續填報。' : '本週結案。任務續行，下週繼續填報。',
      })
    } else {
      steps.push({
        key: 'record', label: '納入更新紀錄', roleLabel: '本週流程終點', state: 'todo', who: null,
        detail: i.hasReviewer ? '主管核准後納入，本週結束' : '你通過後納入，本週結束',
      })
    }
    return steps
  }

  // ③ 當責 A 確認
  if (i.reviewedAt) {
    steps.push({
      key: 'accountable', label: '當責 A 確認', roleLabel: '', state: 'done',
      who: i.reviewedBy || i.accountableName, at: i.reviewedAt, detail: '已通過',
    })
  } else if (i.stage === 'accountable') {
    steps.push({
      key: 'accountable', label: '當責 A 確認', roleLabel: '', state: 'current',
      who: i.accountableName, waitDays: daysSince(i.reportedDoneAt),
      detail: `已回報完成${fmtDate(i.reportedDoneAt) ? ` ${fmtDate(i.reportedDoneAt)}` : ''}，通過＝任務 100% 完成`,
    })
  } else if (i.aReject) {
    steps.push({
      key: 'accountable', label: '當責 A 確認', roleLabel: '', state: 'rejected',
      who: i.aReject.actor || i.accountableName, at: i.aReject.at, note: i.aReject.note,
      detail: '已退回重做',
    })
  } else {
    steps.push({
      key: 'accountable', label: '當責 A 確認', roleLabel: '', state: 'todo',
      who: i.accountableName, detail: null,
    })
  }

  // ④ 完成 100%
  steps.push(i.completed
    ? {
      key: 'complete', label: '完成 100%', roleLabel: '', state: 'done',
      who: i.completedBy, at: i.completedAt,
      detail: '甘特、完成區、里程碑已同步',
    }
    : {
      key: 'complete', label: '完成 100%', roleLabel: '', state: 'todo', who: null,
      detail: '通過後同步甘特、完成區、里程碑',
    })

  return steps
}

/** 輪到當責時，該給哪一組按鈕：審報告？還是確認完成？ */
function pendingActionOf(steps: FlowStep[], stage: FlowStage): ReviewFlow['pendingAction'] {
  if (stage !== 'accountable') return null
  const active = steps.find(s => s.state === 'current')
  if (active?.key === 'supervisor') return 'review-report'   // 代主管審報告
  if (active?.key === 'accountable') return 'confirm-done'   // 確認 100% 完成
  return null
}

function ballOf(steps: FlowStep[], stage: FlowStage, assignee: string): ReviewFlow['ballWith'] {
  if (stage === 'done') return null
  const active = steps.find(s => s.state === 'current' || s.state === 'rejected')
  if (!active) return null
  // who 可能是 null 或空字串（作者不在專案團隊名單、或主管只存 email 沒存名字）。
  // 一律正規化成 null，讓呈現端退回角色名，而不是渲染出「現在在 　 手上」這種空洞。
  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)
  if (active.state === 'rejected') return { who: clean(assignee), roleLabel: '執行者 R' }
  return { who: clean(active.who), roleLabel: active.roleLabel || '下一位審核者' }
}

export interface BuildFlowInput {
  task: FlowSourceTask
  /** 該任務的報告（建議傳整個任務的，不只本週——別週還卡著也要看得到） */
  logs: FlowSourceLog[]
  events?: FlowSourceEvent[]
  /** 本週是否該填報 */
  activeThisWeek?: boolean
  path?: string | null
  /** 當責 A 的顯示名稱 */
  accountableName?: string | null
  /**
   * 該成員是否有指定報告審核主管。未傳則由報告推斷（無報告時視為「沒有」，
   * 因為推斷不出來時，畫成「A 代審」比畫成「等一個不存在的主管」安全）。
   */
  hasReviewer?: boolean
}

/** 由任務 + 報告 + 審視事件，組出流程（A 端走這條）。 */
export function buildReviewFlow(input: BuildFlowInput): ReviewFlow {
  const { task, logs, events = [], activeThisWeek = false, path, accountableName } = input
  const sorted = [...logs].sort((a, b) => (a.createdAt ?? a.logDate).localeCompare(b.createdAt ?? b.logDate))
  const rs = reportStateOf(sorted)
  const hasReviewer = input.hasReviewer ?? sorted.some(l => !!l.authorReviewerName)
  const completed = !!task.completedAt || task.status === 'done'
  const reportedDone = !!task.reportedDoneAt
  const stage = deriveFlowStage({ completed, reportedDone, reportKind: rs.kind, activeThisWeek, hasReviewer })

  const attachments = sorted.reduce((n, l) => n + (l.attachments?.length ?? 0), 0)
  const weekLabel = formatWeekLabel(sorted.find(l => l.weekOf)?.weekOf)
  const lastReject = [...events].reverse().find(e => e.type === 'rejected')

  const steps = buildSteps({
    reportKind: rs.kind, legacy: rs.legacy, hasReviewer, reportedDone, completed, activeThisWeek,
    assignee: sorted[0]?.author || task.assignee || '', stage,
    submittedAt: sorted[0]?.createdAt ?? sorted[0]?.logDate ?? null,
    reportDetail: [weekLabel, sorted.length > 1 ? `${sorted.length} 筆紀錄` : null, attachments > 0 ? `${attachments} 個附件` : null]
      .filter(Boolean).join(' · ') || null,
    reviewerName: rs.reviewer, decidedAt: rs.since,
    rejectNote: sorted.map(l => l.reviewerNote).filter(Boolean).slice(-1)[0] ?? null,
    accountableName: accountableName ?? null,
    reviewedAt: task.reviewedAt ?? null, reviewedBy: task.reviewedBy ?? null,
    reportedDoneAt: task.reportedDoneAt ?? null,
    aReject: lastReject && !task.reportedDoneAt
      ? { actor: lastReject.actor, note: lastReject.note ?? null, at: lastReject.createdAt }
      : null,
    completedAt: task.completedAt ?? null, completedBy: task.completedBy ?? null,
    viewerIsReviewer: false,
  })

  const assignee = task.assignee || ''
  return {
    taskId: task.id, title: task.title, path: path ?? null, stage,
    ballWith: ballOf(steps, stage, assignee), steps, attachments,
    stuckDays: steps.find(s => s.state === 'current')?.waitDays ?? 0,
    assignee, noReviewer: !hasReviewer,
    reportWeekLabel: weekLabel,
    pendingAction: pendingActionOf(steps, stage),
  }
}

/**
 * 由「後端已推導好的摘要」組流程（R主管端 /api/report-reviews 走這條）。
 * 主管端能看到某筆報告，前提就是他是該成員的審核主管 → hasReviewer 恆為 true。
 */
export interface SummaryFlowInput {
  taskId: string
  title: string
  path?: string | null
  assignee: string
  reportKind: ReportKind
  reportedDone: boolean
  completed: boolean
  activeThisWeek?: boolean
  weekOf?: string | null
  /** 報告送出時間（最早一筆） */
  submittedAt?: string | null
  /** 主管核准／駁回的時間 */
  decidedAt?: string | null
  /** 主管駁回原因 */
  rejectNote?: string | null
  /** 審核主管顯示名稱（主管端通常＝登入者本人） */
  reviewerName?: string | null
  attachments?: number
  logCount?: number
  /** 計畫逾期（僅影響文案，不改變棒次） */
  overdue?: boolean
}

export function buildFlowFromSummary(i: SummaryFlowInput): ReviewFlow {
  const stage = deriveFlowStage({
    completed: i.completed, reportedDone: i.reportedDone, reportKind: i.reportKind,
    activeThisWeek: i.activeThisWeek ?? false, hasReviewer: true,
  })
  const weekLabel = formatWeekLabel(i.weekOf)
  const attachments = i.attachments ?? 0

  const steps = buildSteps({
    reportKind: i.reportKind, hasReviewer: true, reportedDone: i.reportedDone,
    completed: i.completed, activeThisWeek: i.activeThisWeek ?? false, overdue: i.overdue,
    assignee: i.assignee, stage,
    submittedAt: i.submittedAt ?? null,
    reportDetail: [weekLabel, i.logCount && i.logCount > 1 ? `${i.logCount} 筆紀錄` : null, attachments > 0 ? `${attachments} 個附件` : null]
      .filter(Boolean).join(' · ') || null,
    reviewerName: i.reviewerName ?? null, decidedAt: i.decidedAt ?? null,
    rejectNote: i.rejectNote ?? null,
    accountableName: null, reviewedAt: null, reviewedBy: null, reportedDoneAt: null,
    aReject: null, completedAt: null, completedBy: null,
    viewerIsReviewer: true,
  })

  return {
    taskId: i.taskId, title: i.title, path: i.path ?? null, stage,
    ballWith: ballOf(steps, stage, i.assignee), steps, attachments,
    stuckDays: steps.find(s => s.state === 'current')?.waitDays ?? 0,
    assignee: i.assignee || '', noReviewer: false,
    reportWeekLabel: weekLabel,
    pendingAction: null,
  }
}

// ─────────────────────────────────────────────────────────
// 頭像
// ─────────────────────────────────────────────────────────

const AVATAR_COLORS = ['bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-orange-600']
export function avatarColorFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initialsOf(name: string): string {
  const n = (name || '?').trim()
  // 顯示名常是「ivypan 潘彥吟」——優先取中文名的末二字，否則取英文首字母
  const zh = n.match(/[一-龥]+/)
  if (zh) return zh[0].slice(-2)
  return n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/**
 * 固定尺寸頭像。不用 <Avatar>：它在 flex 容器裡會被壓扁成橢圓，
 * 這裡直接鎖死寬高並加 aspect-square + shrink-0。
 */
export function FlowAvatar({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      className={cn(
        'inline-flex shrink-0 aspect-square items-center justify-center overflow-hidden rounded-full',
        'text-white font-medium leading-none select-none',
        avatarColorFor(name || '?'), className,
      )}
    >
      <span style={{ fontSize: Math.round(size * 0.42) }}>{initialsOf(name)}</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────
// 流程總覽列
// ─────────────────────────────────────────────────────────

/** 一顆棒次徽章（取代原本四散的 badge） */
export function StageChip({ stage, viewer, days, className }: {
  stage: FlowStage; viewer: FlowViewer; days?: number; className?: string
}) {
  const meta = STAGE_META[stage]
  return (
    <Badge variant="outline" className={cn('text-[11px] px-1.5 py-0 gap-1 font-medium shrink-0', meta.chip, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', meta.dot)} />
      {stageLabel(stage, viewer)}
      {days != null && days > 0 && <span className="tabular-nums opacity-80">· {days}天</span>}
    </Badge>
  )
}

export interface PipelineCounts { unfilled: number; supervisor: number; accountable: number; done: number; running: number }

/**
 * 流程總覽列：把四棒畫成一條線，各棒積了幾件一目瞭然。
 * 點某一棒＝只看卡在那一棒的項目；再點一次取消篩選。
 */
export function ReviewPipelineBar({ counts, value, onChange, viewer, className }: {
  counts: PipelineCounts
  value: FlowStage | null
  onChange: (next: FlowStage | null) => void
  viewer: FlowViewer
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-0.5 overflow-x-auto', className)}>
      {PIPELINE_ORDER.map((key, i) => {
        const meta = STAGE_META[key]
        const n = counts[key]
        const selected = value === key
        return (
          <Fragment key={key}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
            <button
              type="button"
              onClick={() => onChange(selected ? null : key)}
              disabled={n === 0 && !selected}
              aria-pressed={selected}
              title={n === 0
                ? `${stageLabel(key, viewer)}｜目前無項目`
                : `${stageLabel(key, viewer)}｜負責：${meta.owner}｜${n} 件（點擊只看這一棒）`}
              className={cn(
                'group flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-all shrink-0',
                'focus-visible:outline-none focus-visible:ring-2',
                selected ? cn('border-transparent ring-2', meta.ring, meta.chip) : 'border-border bg-background',
                n === 0 && !selected ? 'opacity-40 cursor-default' : 'hover:border-foreground/25',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full shrink-0', meta.dot)} />
              <span className={cn('whitespace-nowrap', selected ? 'font-semibold' : 'text-muted-foreground group-hover:text-foreground')}>
                {stageLabel(key, viewer)}
              </span>
              <span className={cn(
                'tabular-nums rounded px-1 text-[11px] font-semibold',
                n === 0 ? 'text-muted-foreground/50' : selected ? 'bg-background/70' : 'bg-muted text-foreground',
              )}>{n}</span>
            </button>
          </Fragment>
        )
      })}
      {counts.running > 0 && (
        <>
          <span className="mx-1 h-4 w-px bg-border shrink-0" />
          <button
            type="button"
            onClick={() => onChange(value === 'running' ? null : 'running')}
            aria-pressed={value === 'running'}
            title="正常進行中、目前沒有卡在任何人手上"
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-all shrink-0 hover:border-foreground/25',
              value === 'running' ? cn('border-transparent ring-2', STAGE_META.running.ring, STAGE_META.running.chip) : 'border-border bg-background text-muted-foreground',
            )}
          >
            <span className={cn('h-2 w-2 rounded-full shrink-0', STAGE_META.running.dot)} />
            執行中
            <span className="tabular-nums rounded bg-muted px-1 text-[11px] font-semibold text-foreground">{counts.running}</span>
          </button>
        </>
      )}

      {/* 選了棒次＝進入「只看這一棒」的視角，分頁讓位；這裡給一個明顯的出口 */}
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-2 flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground shrink-0 transition-colors hover:text-foreground hover:border-foreground/25"
        >
          <X className="h-3 w-3" />回到分頁
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// 單筆流程時間軸
// ─────────────────────────────────────────────────────────

const STEP_STYLE: Record<FlowStepState, { icon: typeof Check; iconCls: string; nodeCls: string; lineCls: string; titleCls: string }> = {
  done: {
    icon: Check, iconCls: 'text-white',
    nodeCls: 'bg-emerald-500 border-emerald-500', lineCls: 'bg-emerald-500/40',
    titleCls: 'text-foreground',
  },
  current: {
    icon: CircleDot, iconCls: 'text-white',
    nodeCls: 'bg-amber-500 border-amber-500 ring-4 ring-amber-500/20', lineCls: 'bg-border',
    titleCls: 'text-foreground font-semibold',
  },
  rejected: {
    icon: Undo2, iconCls: 'text-white',
    nodeCls: 'bg-red-500 border-red-500 ring-4 ring-red-500/20', lineCls: 'bg-border',
    titleCls: 'text-foreground font-semibold',
  },
  skipped: {
    icon: MinusCircle, iconCls: 'text-muted-foreground',
    nodeCls: 'bg-muted border-border border-dashed', lineCls: 'bg-border',
    titleCls: 'text-muted-foreground',
  },
  todo: {
    icon: Circle, iconCls: 'text-muted-foreground/50',
    nodeCls: 'bg-background border-border', lineCls: 'bg-border',
    titleCls: 'text-muted-foreground',
  },
}

/**
 * 單筆任務的完整審核流程（右側面板主體）。
 * actions＝這一棒若輪到目前使用者，要顯示的操作按鈕（駁回／審核通過…）。
 */
export type FlowPanelTab = 'flow' | 'logs'

export function ReviewFlowTimeline({
  flow, viewer, actions, logs, logsCount = 0, tab = 'flow', onTabChange, onCollapse, hideFlow, className,
}: {
  flow: ReviewFlow
  viewer: FlowViewer
  actions?: React.ReactNode
  /** 工作紀錄分頁的內容 */
  logs?: React.ReactNode
  logsCount?: number
  tab?: FlowPanelTab
  onTabChange?: (t: FlowPanelTab) => void
  /** 收合整個右欄 */
  onCollapse?: () => void
  /**
   * 隱藏審核流程，只留工作紀錄。
   * 用於「本週報告尚未送出」的情境——此時流程講的是上一份報告，顯示出來會讓人
   * 誤以為自己已經送出並在被審核。
   */
  hideFlow?: boolean
  className?: string
}) {
  const showFlow = !hideFlow
  const activeTab: FlowPanelTab = hideFlow ? 'logs' : tab
  return (
    <div className={cn('flex flex-col min-h-0 h-full', className)}>
      {/* 標題列：只留識別用的標題與收合鈕。麵包屑/負責人/棒次/附件在左欄那一列都有了，
          在這裡重列會把真正重要的「下一棒是誰」稀釋掉。 */}
      <div className="flex items-center gap-2 border-b px-4 py-2.5 shrink-0">
        <div className="min-w-0 flex-1 text-sm font-semibold truncate" title={flow.title}>{flow.title}</div>
        {onCollapse && (
          <button type="button" onClick={onCollapse} title="收合右欄"
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <PanelRightClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 下一棒 —— A/主管 最想知道的一句話 */}
      {showFlow && <div className={cn(
        'flex items-center gap-2 px-4 py-2 text-xs shrink-0 border-b',
        flow.ballWith ? 'bg-amber-50/60 dark:bg-amber-950/20' : 'bg-emerald-50/60 dark:bg-emerald-950/20',
      )}>
        {flow.ballWith ? (
          <>
            <UserRound className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-muted-foreground shrink-0">下一棒</span>
            {flow.ballWith.who && <FlowAvatar name={flow.ballWith.who} size={16} />}
            <span className="font-medium truncate">{flow.ballWith.who ?? flow.ballWith.roleLabel}</span>
            {flow.ballWith.who && (
              <span className="text-muted-foreground shrink-0">· {flow.ballWith.roleLabel}</span>
            )}
            {flow.stuckDays > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground tabular-nums shrink-0">
                <Clock className="h-3 w-3" />已停 {flow.stuckDays} 天
              </span>
            )}
          </>
        ) : (
          <>
            <Flag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-medium text-emerald-700 dark:text-emerald-400">流程已走完，無待辦</span>
          </>
        )}
      </div>}

      {/* 分頁：流程與工作紀錄分開，避免長篇紀錄把流程淹掉 */}
      {logs != null && showFlow && (
        <div className="border-b px-3 py-2 shrink-0">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {([
              { val: 'flow' as const, label: '審核流程', Icon: GitBranch, cnt: 0 },
              { val: 'logs' as const, label: '工作紀錄', Icon: FileText, cnt: logsCount },
            ]).map(({ val, label, Icon, cnt }) => {
              const active = activeTab === val
              return (
                <button key={val} type="button" onClick={() => onTabChange?.(val)} aria-pressed={active}
                  className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all',
                    active ? 'bg-background font-semibold text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground')}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                  {cnt > 0 && (
                    <span className={cn('rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-foreground/70')}>{cnt}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 工作紀錄分頁 */}
      {logs != null && activeTab === 'logs' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {logsCount === 0
            ? <p className="text-sm text-muted-foreground text-center py-8">此任務尚無工作紀錄</p>
            : logs}
        </div>
      )}

      {/* 時間軸 */}
      <div className={cn('flex-1 overflow-y-auto px-4 py-3 min-h-0',
        (!showFlow || (logs != null && activeTab !== 'flow')) && 'hidden')}>
        <ol className="relative">
          {flow.steps.map((step, i) => {
            const st = STEP_STYLE[step.state]
            const Icon = st.icon
            const last = i === flow.steps.length - 1
            return (
              <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
                {/* 節點與連線 */}
                <div className="flex flex-col items-center shrink-0">
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', st.nodeCls)}>
                    <Icon className={cn('h-3 w-3', st.iconCls)} strokeWidth={3} />
                  </span>
                  {!last && <span className={cn('mt-1 w-0.5 flex-1 rounded-full min-h-[16px]', st.lineCls)} />}
                </div>

                {/* 內容 */}
                <div className="flex-1 min-w-0 -mt-0.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={cn('text-sm', st.titleCls)}>{step.label}</span>
                    {step.roleLabel && <span className="text-xs text-muted-foreground">{step.roleLabel}</span>}
                    {step.state === 'current' && (
                      <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                        現在在這
                      </Badge>
                    )}
                    {step.state === 'rejected' && (
                      <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                        已駁回
                      </Badge>
                    )}
                    {step.warn && (
                      <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 gap-0.5 bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800"
                        title="此成員未指定報告審核主管，可到專案「團隊」設定">
                        <TriangleAlert className="h-3 w-3" />{step.warn}
                      </Badge>
                    )}
                  </div>

                  {(step.who || step.at) && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                      {step.who && step.who.trim() && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <FlowAvatar name={step.who} size={16} />
                          <span className="text-foreground/80 truncate">{step.who}</span>
                        </span>
                      )}
                      {step.at && <span className="tabular-nums shrink-0">{fmtDateTime(step.at)}</span>}
                    </div>
                  )}

                  {step.detail && (
                    <p className={cn('mt-1 text-xs leading-relaxed',
                      step.state === 'skipped' ? 'text-orange-700/90 dark:text-orange-400/90'
                        : step.state === 'todo' ? 'text-muted-foreground/60' : 'text-muted-foreground')}>
                      {step.detail}
                    </p>
                  )}

                  {step.note && (
                    <p className="mt-1.5 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                      <span className="font-medium">原因：</span>{step.note}
                    </p>
                  )}

                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {/* 操作列：固定在底部、靠最右。時間軸再長也不會把按鈕捲出視野 */}
      {actions && (
        <div className="shrink-0 border-t bg-background/95 px-4 py-2.5 backdrop-blur">
          <div className="flex items-center justify-end gap-2">{actions}</div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// 未選取時的右欄
// ─────────────────────────────────────────────────────────

/**
 * 橫向精簡流程條 —— 給空間有限、又不需要完整履歷的地方用（例如 R 的填報彈窗）。
 * 一行內講完：這份報告走過哪幾棒、現在卡在誰手上、卡了幾天。
 */
export function ReviewFlowStrip({ flow, viewer, className }: {
  flow: ReviewFlow
  viewer: FlowViewer
  className?: string
}) {
  // 只取有意義的棒次（buildSteps 已依情境決定要不要畫當責/完成那兩棒）
  const steps = flow.steps
  return (
    <div className={cn('rounded-lg border bg-muted/20 px-3 py-2', className)}>
      {/* 講清楚是哪一份報告的進度——否則會和「本週未填」混淆成互相矛盾的兩件事 */}
      <div className="mb-1.5 text-[11px] text-muted-foreground">
        {flow.reportWeekLabel
          ? <>你先前送出的週報（<span className="font-medium text-foreground/70">{flow.reportWeekLabel}</span>）目前的審核進度</>
          : <>你先前送出的週報目前的審核進度</>}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {steps.map((step, i) => {
          const tone =
            step.state === 'done' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/25 dark:text-emerald-300 dark:border-emerald-800'
              : step.state === 'current' ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
                : step.state === 'rejected' ? 'bg-red-100 text-red-700 border-red-300 font-semibold dark:bg-red-900/25 dark:text-red-300 dark:border-red-800'
                  : 'bg-background text-muted-foreground border-border'
          return (
            <Fragment key={step.key}>
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />}
              <span className={cn('flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]', tone)}
                title={[step.detail, step.note && `原因：${step.note}`].filter(Boolean).join('\n')}>
                {step.state === 'done' && <Check className="h-3 w-3" strokeWidth={3} />}
                {step.state === 'current' && <CircleDot className="h-3 w-3" strokeWidth={3} />}
                {step.state === 'rejected' && <Undo2 className="h-3 w-3" strokeWidth={3} />}
                {step.label}
              </span>
            </Fragment>
          )
        })}
      </div>

      {/* 一句話結論 */}
      <div className="mt-1.5 flex items-center gap-1.5 border-t pt-1.5 text-xs">
        {flow.ballWith ? (
          <>
            <UserRound className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-muted-foreground shrink-0">現在在</span>
            {flow.ballWith.who && <FlowAvatar name={flow.ballWith.who} size={16} />}
            <span className="font-medium truncate">{flow.ballWith.who ?? flow.ballWith.roleLabel}</span>
            <span className="text-muted-foreground shrink-0">手上</span>
            {flow.stuckDays > 0 && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                <Clock className="h-3 w-3" />已等 {flow.stuckDays} 天
              </span>
            )}
          </>
        ) : (
          <>
            <Flag className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium text-emerald-700 dark:text-emerald-400">流程已走完，不需等待任何人</span>
          </>
        )}
      </div>
    </div>
  )
}

/** 右欄收合後的細長條：點一下展開 */
export function ReviewFlowCollapsed({ onExpand, label = '審核流程 · 工作紀錄' }: { onExpand: () => void; label?: string }) {
  // self-stretch 而非 h-full：這是 flex 子項，h-full 的 100% 解不到父層高度（父層高度是 auto），
  // 結果只長到內容高度，左側那條 border 就會半途而廢。
  return (
    <button type="button" onClick={onExpand} title={`展開${label}`}
      className="flex w-11 shrink-0 self-stretch flex-col items-center gap-2 border-l bg-muted/20 py-3 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
      <PanelRightOpen className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium tracking-wide leading-tight [writing-mode:vertical-rl]">
        {label}
      </span>
    </button>
  )
}

/** 骨架預覽的四步（不帶資料，純粹說明右欄會出現什麼） */
const SKELETON: { label: string; sub: string }[] = [
  { label: 'R 填報週報', sub: '誰送出、何時、附件' },
  { label: '報告審核', sub: '主管或當責、核准或駁回' },
  { label: '當責 A 確認', sub: '僅在回報完成時出現' },
  { label: '完成 100%', sub: '同步甘特與里程碑' },
]

/**
 * 右欄未選取時：與其放一句「請點左側」，不如把待會兒會看到的東西先畫出來，
 * 讓人一眼知道這塊是「單筆的流程履歷」。
 */
export function ReviewFlowEmpty({ counts, viewer }: { counts: PipelineCounts; viewer: FlowViewer }) {
  const actionable = PIPELINE_ORDER.filter(k => k !== 'done' && counts[k] > 0)
  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 py-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">審核流程履歷</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        點左側任一列，看它每一棒誰經手、卡了幾天、下一棒給誰。
      </p>

      {/* 骨架預覽 */}
      <ol className="mt-4 rounded-lg border bg-background/60 px-3 py-3">
        {SKELETON.map((s, i) => (
          <li key={s.label} className="flex gap-2.5 pb-3 last:pb-0">
            <div className="flex flex-col items-center shrink-0">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 bg-background" />
              {i < SKELETON.length - 1 && <span className="mt-0.5 w-0.5 flex-1 min-h-[12px] rounded-full bg-border" />}
            </div>
            <div className="min-w-0 -mt-0.5">
              <div className="text-xs text-muted-foreground/80">{s.label}</div>
              <div className="text-[11px] text-muted-foreground/50">{s.sub}</div>
            </div>
          </li>
        ))}
      </ol>

      {actionable.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-medium text-muted-foreground mb-1.5">目前卡住的項目</div>
          <div className="space-y-1">
            {actionable.map(k => (
              <div key={k} className="flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-1.5 text-xs">
                <span className={cn('h-2 w-2 rounded-full shrink-0', STAGE_META[k].dot)} />
                <span className="truncate">{stageLabel(k, viewer)}</span>
                <span className="ml-auto tabular-nums font-semibold shrink-0">{counts[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
