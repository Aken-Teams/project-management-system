'use client'

import React, { useState, useEffect, useMemo } from "react"
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { MilestoneTaskView } from '@/components/milestone-task-view'
import { useAuth } from '@/lib/auth-context'
import { PROJECT_TYPE_LABELS, TEAM_ROLE_LABELS, type ProjectStatus, type Project, type TeamRole } from '@/lib/mock-data'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Users,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  History,
  Tag,
  LayoutList,
  ListTodo,
  Shield,
  TimerReset,
  Info,
  Milestone,
  HelpCircle,
  User,
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  X,
  FileDown,
  CalendarRange,
  Pencil,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { type Risk } from '@/lib/mock-data'
import { ProjectEditDialog, type ProjectEditData } from '@/components/project-edit-dialog'
import { ProjectDeleteDialog } from '@/components/project-delete-dialog'

// --- Risk Tab component (Static risks from project creation) ---

const IMPACT_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' }
const PROBABILITY_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' }
const STATUS_LABELS: Record<string, string> = { open: '未處理', mitigated: '已緩解', closed: '已關閉' }

function getRiskLevelColor(level: string) {
  switch (level) {
    case 'high': return 'bg-destructive text-destructive-foreground'
    case 'medium': return 'bg-warning text-warning-foreground'
    case 'low': return 'bg-muted text-muted-foreground'
    default: return 'bg-muted text-muted-foreground'
  }
}

function getRiskStatusColor(status: string) {
  switch (status) {
    case 'open': return 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/10'
    case 'mitigated': return 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/10'
    case 'closed': return 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/10'
    default: return ''
  }
}

function ProjectRiskTab({ project }: { project: Project }) {
  const openRisks = project.risks.filter(r => r.status === 'open')
  const mitigatedRisks = project.risks.filter(r => r.status === 'mitigated')
  const closedRisks = project.risks.filter(r => r.status === 'closed')

  if (project.risks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">尚未登記風險項目</p>
          <p className="text-sm text-muted-foreground mt-1">開案時可預先識別已知風險，評估影響程度和發生機率</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg bg-muted/50 border px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">已識別 {project.risks.length} 項風險</span>
        </div>
        <div className="flex items-center gap-2">
          {openRisks.length > 0 && (
            <Badge variant="destructive" className="text-sm">{openRisks.length} 未處理</Badge>
          )}
          {mitigatedRisks.length > 0 && (
            <Badge className="text-sm bg-warning text-warning-foreground">{mitigatedRisks.length} 已緩解</Badge>
          )}
          {closedRisks.length > 0 && (
            <Badge variant="secondary" className="text-sm">{closedRisks.length} 已關閉</Badge>
          )}
        </div>
      </div>

      {/* Risk list */}
      <div className="space-y-3">
        {project.risks.map(risk => (
          <Card key={risk.id} className={getRiskStatusColor(risk.status)}>
            <div className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${risk.status === 'closed' ? 'text-muted-foreground' : risk.impact === 'high' ? 'text-destructive' : 'text-warning'}`} />
                  <div className="min-w-0">
                    <h4 className={`text-sm font-medium ${risk.status === 'closed' ? 'text-muted-foreground line-through' : ''}`}>{risk.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{risk.description}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-sm shrink-0">
                  {STATUS_LABELS[risk.status]}
                </Badge>
              </div>

              {/* Impact + Probability badges */}
              <div className="flex items-center gap-2 pl-6.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">影響程度</span>
                  <Badge className={`text-[10px] px-1.5 ${getRiskLevelColor(risk.impact)}`}>
                    {IMPACT_LABELS[risk.impact]}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">發生機率</span>
                  <Badge className={`text-[10px] px-1.5 ${getRiskLevelColor(risk.probability)}`}>
                    {PROBABILITY_LABELS[risk.probability]}
                  </Badge>
                </div>
              </div>

              {/* Mitigation */}
              {risk.mitigation && (
                <div className="pl-6.5 pt-1 border-t">
                  <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    緩解措施
                  </div>
                  <p className="text-sm text-muted-foreground">{risk.mitigation}</p>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <p className="text-sm text-muted-foreground flex items-center gap-1.5 pt-1">
        <Info className="h-3.5 w-3.5 shrink-0" />
        風險於開案時識別登記，用於評估專案潛在問題與準備緩解措施
      </p>
    </div>
  )
}

// --- Auto-generated weekly activity summary ---

function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday.toISOString().split('T')[0]
}

function getWeekSunday(mondayStr: string): string {
  const d = new Date(mondayStr)
  d.setDate(d.getDate() + 6)
  return d.toISOString().split('T')[0]
}

interface WeekActivity {
  weekMonday: string
  completedTasks: { taskId: string; taskName: string; completedBy: string; completedAt: string; milestoneName: string }[]
  logs: { logId: string; taskId: string; taskName: string; author: string; content: string; logDate: string }[]
  activeMembers: Set<string>
}

function buildWeeklyActivities(project: Project): WeekActivity[] {
  const weekMap = new Map<string, WeekActivity>()

  const getOrCreate = (weekMonday: string): WeekActivity => {
    if (!weekMap.has(weekMonday)) {
      weekMap.set(weekMonday, { weekMonday, completedTasks: [], logs: [], activeMembers: new Set() })
    }
    return weekMap.get(weekMonday)!
  }

  project.tasks.filter(t => !t.parentId).forEach(task => {
    if (task.completedAt) {
      const monday = getWeekMonday(task.completedAt)
      const milestone = project.milestones.find(m => m.id === task.milestoneId)
      const week = getOrCreate(monday)
      const who = task.completedBy || task.assignee
      week.completedTasks.push({
        taskId: task.id,
        taskName: task.title,
        completedBy: who,
        completedAt: task.completedAt,
        milestoneName: milestone?.name || '',
      })
      week.activeMembers.add(who)
    }
  })

  project.taskLogs.forEach(log => {
    const monday = getWeekMonday(log.logDate)
    const task = project.tasks.find(t => t.id === log.taskId)
    const week = getOrCreate(monday)
    week.logs.push({
      logId: log.id,
      taskId: log.taskId,
      taskName: task?.title || log.taskId,
      author: log.author,
      content: log.content,
      logDate: log.logDate,
    })
    week.activeMembers.add(log.author)
  })

  return Array.from(weekMap.values()).sort((a, b) => b.weekMonday.localeCompare(a.weekMonday))
}

const WEEKS_PER_PAGE = 4

/** Simulate AI report generation with a delay + mock content */
function generateMockAIReport(
  project: Project,
  weeks: WeekActivity[],
  mode: 'weekly' | 'monthly',
): string {
  const totalCompleted = weeks.reduce((s, w) => s + w.completedTasks.length, 0)
  const totalLogs = weeks.reduce((s, w) => s + w.logs.length, 0)
  const activeMembers = new Set<string>()
  weeks.forEach(w => w.activeMembers.forEach(m => activeMembers.add(m)))

  const allMembers = new Set(project.team)
  const inactiveMembers = [...allMembers].filter(m => !activeMembers.has(m))

  const completedNames = weeks.flatMap(w => w.completedTasks.map(ct => ct.taskName))
  const completedList = completedNames.length > 0
    ? completedNames.slice(0, 5).join('、') + (completedNames.length > 5 ? ` 等 ${completedNames.length} 項` : '')
    : '無'

  const milestoneProgress = project.milestones
    .map(m => `${m.name} ${m.progress}%`)
    .join('、')

  const periodLabel = mode === 'weekly' ? '本週' : '本月'
  const openRisks = project.risks.filter(r => r.status === 'open').length
  const blockedTasks = project.tasks.filter(t => t.status === 'blocked').length

  let report = `## ${project.name} — ${periodLabel}進度摘要\n\n`
  report += `**報告期間：** ${weeks.length > 0 ? new Date(weeks[weeks.length - 1].weekMonday).toLocaleDateString('zh-TW') : '—'} 至 ${weeks.length > 0 ? new Date(getWeekSunday(weeks[0].weekMonday)).toLocaleDateString('zh-TW') : '—'}\n\n`
  report += `### 整體概況\n`
  report += `- 專案進度：**${project.progress}%**\n`
  report += `- 里程碑狀態：${milestoneProgress}\n`
  report += `- ${periodLabel}完成任務：**${totalCompleted}** 項\n`
  report += `- ${periodLabel}工作紀錄：**${totalLogs}** 筆\n`
  report += `- 活躍成員：${[...activeMembers].join('、') || '無'}\n`
  if (inactiveMembers.length > 0) {
    report += `- 未提交紀錄：${inactiveMembers.join('、')}\n`
  }
  report += `\n### 主要成果\n`
  report += `${completedList !== '無' ? completedList : '本期間無任務完成'}\n\n`
  if (blockedTasks > 0 || openRisks > 0) {
    report += `### 需關注事項\n`
    if (blockedTasks > 0) report += `- ${blockedTasks} 個任務受阻中\n`
    if (openRisks > 0) report += `- ${openRisks} 個未解決風險\n`
    report += `\n`
  }
  report += `### 下一步\n`
  const nextTasks = project.tasks.filter(t => !t.parentId && (t.status === 'in-progress' || t.status === 'todo')).slice(0, 3)
  if (nextTasks.length > 0) {
    nextTasks.forEach(t => { report += `- ${t.title}（${t.assignee}）\n` })
  } else {
    report += `- 所有任務已完成\n`
  }
  report += `\n---\n*此報告由 AI 自動產生，資料來源為團隊工作紀錄與任務完成狀態。*`
  return report
}

function WeeklyActivitySummary({ project }: { project: Project }) {
  const allWeeks = useMemo(() => buildWeeklyActivities(project), [project])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedWeekMonday, setSelectedWeekMonday] = useState<string | null>(null)

  // Report dialog state
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [reportType, setReportType] = useState<'weekly' | 'monthly'>('weekly')
  const [reportDateFrom, setReportDateFrom] = useState('')
  const [reportDateTo, setReportDateTo] = useState('')
  const [reportFormat, setReportFormat] = useState<'pptx' | 'docx' | 'pdf'>('pptx')
  const [reportSections, setReportSections] = useState({
    summary: true,
    tasks: true,
    personnel: true,
    charts: true,
    rawData: false,
  })
  const [reportGenerating, setReportGenerating] = useState(false)
  const [reportDownloaded, setReportDownloaded] = useState<string | null>(null)
  const [comingSoonOpen, setComingSoonOpen] = useState(false)

  const allActiveMembers = useMemo(() => {
    const members = new Set<string>()
    allWeeks.forEach(w => w.activeMembers.forEach(m => members.add(m)))
    return [...members].sort()
  }, [allWeeks])

  // Date-only filtered weeks for matrix (no member/search filter)
  const matrixWeeks = useMemo(() => {
    return allWeeks.filter(week => {
      if (dateFrom && getWeekSunday(week.weekMonday) < dateFrom) return false
      if (dateTo && week.weekMonday > dateTo) return false
      return true
    })
  }, [allWeeks, dateFrom, dateTo])

  const projectMembers = useMemo(() => [...new Set(project.team)].sort(), [project.team])

  const totalPages = Math.max(1, Math.ceil(matrixWeeks.length / WEEKS_PER_PAGE))
  const safePage = Math.min(page, totalPages - 1)
  const pagedMatrixWeeks = matrixWeeks.slice(safePage * WEEKS_PER_PAGE, (safePage + 1) * WEEKS_PER_PAGE)

  // Members with active tasks but no recent logs
  const missingUpdateMembers = useMemo(() => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentLogAuthors = new Set<string>()
    project.taskLogs.forEach(log => {
      if (new Date(log.logDate) >= sevenDaysAgo) recentLogAuthors.add(log.author)
    })
    const membersWithActiveTasks = new Set<string>()
    project.tasks.forEach(t => {
      if (t.status === 'in-progress' || t.status === 'todo') {
        membersWithActiveTasks.add(t.assignee)
      }
    })
    return [...membersWithActiveTasks].filter(m => !recentLogAuthors.has(m)).sort()
  }, [project.taskLogs, project.tasks])

  const handleOpenReportDialog = () => {
    // Pre-fill date range based on current filter or default
    const today = new Date().toISOString().split('T')[0]
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    setReportDateFrom(reportType === 'weekly' ? oneWeekAgo : oneMonthAgo)
    setReportDateTo(today)
    setReportDialogOpen(true)
  }

  const handleGenerateReport = () => {
    setReportDialogOpen(false)
    setComingSoonOpen(true)
  }

  if (allWeeks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <History className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">尚無活動紀錄</p>
          <p className="text-sm text-muted-foreground mt-1">團隊成員可在「我的任務」中記錄工作內容</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-muted/50 border p-3 space-y-2.5">
      {/* Row 1: search + date range + report button */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[200px] max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜尋任務、人員、內容..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(0) }}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(0) }}
            className="h-8 text-sm w-[140px]"
          />
          <span className="text-sm text-muted-foreground">至</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(0) }}
            className="h-8 text-sm w-[140px]"
          />
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => { setDateFrom(''); setDateTo(''); setPage(0) }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-sm gap-1.5 ml-auto"
              onClick={handleOpenReportDialog}
            >
              <Sparkles className="h-3.5 w-3.5" />
              產生報告
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" />
                AI 報告產生
              </DialogTitle>
              <DialogDescription className="text-sm">
                選擇報告類型、期間和格式，AI 將自動彙整專案資料產生報告文件。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1">
              {/* Report Type + Format — side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">報告類型</Label>
                  <div className="flex gap-1.5">
                    {([['weekly', '週報'], ['monthly', '月報']] as const).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => {
                          setReportType(value)
                          const today = new Date().toISOString().split('T')[0]
                          const offset = value === 'weekly' ? 7 : 30
                          setReportDateFrom(new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                          setReportDateTo(today)
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-md border text-sm font-medium transition-all ${
                          reportType === value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">輸出格式</Label>
                  <div className="flex gap-1.5">
                    {([['pptx', 'PPT'], ['docx', 'Word'], ['pdf', 'PDF']] as const).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setReportFormat(value)}
                        className={`flex-1 py-1.5 px-2 rounded-md border text-sm font-medium transition-all ${
                          reportFormat === value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Date Range */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">報告期間</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={reportDateFrom}
                    onChange={e => setReportDateFrom(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">至</span>
                  <Input
                    type="date"
                    value={reportDateTo}
                    onChange={e => setReportDateTo(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* Report Sections */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">報告內容</Label>
                <div className="space-y-1 rounded-md border p-2">
                  {([
                    ['summary', '整體進度摘要'],
                    ['tasks', '任務完成狀況'],
                    ['personnel', '人員工作紀錄'],
                    ['charts', '圖表分析'],
                    ['rawData', '原始資料'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        id={`report-${key}`}
                        checked={reportSections[key]}
                        onCheckedChange={(checked) =>
                          setReportSections(prev => ({ ...prev, [key]: !!checked }))
                        }
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="pt-0">
              <Button variant="outline" size="sm" onClick={() => setReportDialogOpen(false)} disabled={reportGenerating}>
                取消
              </Button>
              <Button size="sm" onClick={handleGenerateReport} disabled={reportGenerating} className="gap-1.5">
                {reportGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    產生中...
                  </>
                ) : (
                  <>
                    <FileDown className="h-3.5 w-3.5" />
                    產生報告
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={comingSoonOpen} onOpenChange={setComingSoonOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                功能開發中
              </DialogTitle>
              <DialogDescription>
                AI 報告產生功能尚在開發中，敬請期待！
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setComingSoonOpen(false)}>確定</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Row 2: member chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => { setSelectedMember(null); setPage(0) }}
          className={`text-sm px-2.5 py-1 rounded-full border transition-all ${
            !selectedMember
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:bg-muted'
          }`}
        >
          全部
        </button>
        {allActiveMembers.map(name => (
          <button
            key={name}
            onClick={() => { setSelectedMember(selectedMember === name ? null : name); setPage(0) }}
            className={`text-sm px-2.5 py-1 rounded-full border transition-all ${
              selectedMember === name
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      </div>

      {/* Report download success notification */}
      {reportDownloaded && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span>報告已產生：{reportDownloaded}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto" onClick={() => setReportDownloaded(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Summary line + missing updates */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          系統自動彙整自任務紀錄與完成狀態
          {matrixWeeks.length !== allWeeks.length
            ? `，篩選結果：${matrixWeeks.length} 週`
            : `，共 ${allWeeks.length} 週活動`
          }
        </p>
        {missingUpdateMembers.length > 0 && (
          <p className="text-sm text-warning flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {missingUpdateMembers.join('、')} 7 天內未更新
          </p>
        )}
      </div>

      {/* Member × Week Matrix */}
      {pagedMatrixWeeks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">無符合條件的紀錄</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground w-[180px]">
                      成員
                    </th>
                    {pagedMatrixWeeks.map(week => {
                      const sunday = getWeekSunday(week.weekMonday)
                      const mLabel = new Date(week.weekMonday).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
                      const sLabel = new Date(sunday).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
                      const isSelected = selectedWeekMonday === week.weekMonday
                      return (
                        <th
                          key={week.weekMonday}
                          className={`text-center py-3 px-4 font-medium text-sm cursor-pointer transition-colors hover:bg-muted/50 whitespace-nowrap ${isSelected ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                          onClick={() => setSelectedWeekMonday(isSelected ? null : week.weekMonday)}
                        >
                          {mLabel}~{sLabel}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {projectMembers.map(member => {
                    const isHighlighted = selectedMember === member
                    return (
                      <tr key={member} className={`border-b last:border-0 transition-colors ${isHighlighted ? 'bg-primary/5' : ''}`}>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center font-medium shrink-0">
                              {member.charAt(0)}
                            </div>
                            <span className="text-sm font-medium truncate">{member}</span>
                          </div>
                        </td>
                        {pagedMatrixWeeks.map(week => {
                          const logCount = week.logs.filter(l => l.author === member).length
                          const completedCount = week.completedTasks.filter(ct => ct.completedBy === member).length
                          const total = logCount + completedCount
                          const isSelectedWeek = selectedWeekMonday === week.weekMonday
                          return (
                            <td key={week.weekMonday} className={`text-center py-3 px-4 ${isSelectedWeek ? 'bg-primary/5' : ''}`}>
                              {total > 0 ? (
                                <span className="inline-flex items-center gap-1.5 text-sm">
                                  <span className="h-2 w-2 rounded-full bg-green-500" />
                                  <span className="text-green-700 dark:text-green-400 font-medium tabular-nums">{total}筆</span>
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground/30">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground/60 border-t">
              <Info className="h-3.5 w-3.5 shrink-0" />
              點擊上方日期欄位可展開該週詳細紀錄
            </div>
          </Card>

          {/* Detail dialog for selected week */}
          <Dialog open={!!selectedWeekMonday} onOpenChange={(open) => { if (!open) setSelectedWeekMonday(null) }}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
              {selectedWeekMonday && (() => {
                const week = matrixWeeks.find(w => w.weekMonday === selectedWeekMonday)
                if (!week) return null
                const sunday = getWeekSunday(week.weekMonday)
                // Apply member/search filters for detail
                let detailLogs = week.logs
                let detailCompleted = week.completedTasks
                if (selectedMember) {
                  detailLogs = detailLogs.filter(l => l.author === selectedMember)
                  detailCompleted = detailCompleted.filter(ct => ct.completedBy === selectedMember)
                }
                if (searchQuery.trim()) {
                  const q = searchQuery.trim().toLowerCase()
                  detailLogs = detailLogs.filter(l =>
                    l.taskName.toLowerCase().includes(q) || l.author.toLowerCase().includes(q) || l.content.toLowerCase().includes(q)
                  )
                  detailCompleted = detailCompleted.filter(ct =>
                    ct.taskName.toLowerCase().includes(q) || ct.completedBy.toLowerCase().includes(q) || ct.milestoneName.toLowerCase().includes(q)
                  )
                }
                const mondayLabel = new Date(week.weekMonday).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
                const sundayLabel = new Date(sunday).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })

                return (
                  <>
                    <DialogHeader className="px-5 pt-5 pb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <DialogTitle className="text-base">{mondayLabel} — {sundayLabel}</DialogTitle>
                      </div>
                      <DialogDescription asChild>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          {detailCompleted.length > 0 && (
                            <Badge variant="default" className="text-sm gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {detailCompleted.length} 完成
                            </Badge>
                          )}
                          {detailLogs.length > 0 && (
                            <Badge variant="secondary" className="text-sm gap-1">
                              <FileText className="h-3 w-3" />
                              {detailLogs.length} 筆紀錄
                            </Badge>
                          )}
                          {detailLogs.length === 0 && detailCompleted.length === 0 && (
                            <span className="text-sm">此週無紀錄</span>
                          )}
                        </div>
                      </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
                      {detailCompleted.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-success mb-2 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            完成的任務
                          </div>
                          <div className="space-y-1.5">
                            {detailCompleted.map(ct => (
                              <div key={ct.taskId} className="flex items-center gap-2 p-2.5 rounded-lg bg-success/5 border border-success/10 text-sm">
                                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                                <span className="font-medium">{ct.taskName}</span>
                                <span className="text-sm text-muted-foreground">({ct.milestoneName})</span>
                                <span className="ml-auto text-sm text-muted-foreground flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {ct.completedBy}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {detailLogs.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            工作紀錄
                          </div>
                          <div className="space-y-2">
                            {detailLogs.map(log => (
                              <div key={log.logId} className="p-3 rounded-lg border text-sm">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <span className="font-medium text-sm">{log.taskName}</span>
                                  <span className="text-[11px] text-muted-foreground shrink-0">
                                    {log.author} · {new Date(log.logDate).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })}
                                  </span>
                                </div>
                                <p className="text-muted-foreground text-sm leading-relaxed">{log.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )
              })()}
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-sm text-muted-foreground">
            第 {safePage + 1} / {totalPages} 頁
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={safePage === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Main page ---

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/projects/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setProject(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [id])

  const handleSaveProject = async (data: ProjectEditData) => {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || '更新失敗')
    }
    const updated = await res.json()
    setProject(updated)
  }

  const handleDeleteProject = async () => {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || '刪除失敗')
    }
    router.push('/projects')
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">載入專案資料中...</p>
        </div>
      </DashboardLayout>
    )
  }

  if (!project) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="text-2xl font-bold mb-2">找不到專案</h2>
          <p className="text-muted-foreground mb-4">此專案不存在或已被刪除</p>
          <Button onClick={() => router.push('/projects')}>返回專案列表</Button>
        </div>
      </DashboardLayout>
    )
  }

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'green': return 'bg-success text-success-foreground'
      case 'yellow': return 'bg-warning text-warning-foreground'
      case 'red': return 'bg-destructive text-destructive-foreground'
    }
  }

  const getStatusIcon = (status: ProjectStatus) => {
    switch (status) {
      case 'green': return <CheckCircle2 className="h-4 w-4" />
      case 'yellow': return <Clock className="h-4 w-4" />
      case 'red': return <AlertCircle className="h-4 w-4" />
    }
  }

  const getStatusText = (status: ProjectStatus) => {
    switch (status) {
      case 'green': return '正常'
      case 'yellow': return '注意'
      case 'red': return '風險'
    }
  }

  const budgetUtilization = Math.round((project.budgetUsed / project.budget) * 100)
  const completedMilestones = project.milestones.filter(m => m.status === 'done').length
  const pendingDelays = project.delayRequests.filter(r => r.status === 'pending')
  const daysLeft = Math.max(0, Math.ceil((new Date(project.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  const openRisks = project.risks.filter(r => r.status === 'open')

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header - Compact */}
        <div>
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="gap-2 mb-3 -ml-2">
              <ArrowLeft className="h-4 w-4" />
              返回專案列表
            </Button>
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-mono text-muted-foreground">{project.projectCode}</span>
                <Badge variant="outline" className="text-sm">
                  <Tag className="h-3 w-3 mr-1" />
                  {PROJECT_TYPE_LABELS[project.projectType]}
                </Badge>
                <Badge variant="secondary" className={getStatusColor(project.status)}>
                  <span className="flex items-center gap-1">
                    {getStatusIcon(project.status)}
                    {getStatusText(project.status)}
                  </span>
                </Badge>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5 text-primary border-primary/30 hover:bg-primary/10 hover:text-primary" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                編輯
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                刪除
              </Button>
            </div>
          </div>

          {/* Pending delay alert - inline */}
          {pendingDelays.length > 0 && (
            <div className="mt-3 p-3 rounded-lg border border-warning/50 bg-warning/10 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <span className="text-sm font-medium text-warning">有 {pendingDelays.length} 筆延遲申請待主管審核</span>
            </div>
          )}
        </div>

        {/* Stats Bar - Horizontal compact */}
        <div className="flex items-center gap-0 rounded-lg border bg-card divide-x overflow-hidden">
          <div className="flex-1 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Target className="h-3.5 w-3.5" />
              進度
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold">{project.progress}%</span>
              <Progress value={project.progress} className="h-1.5 flex-1" />
            </div>
          </div>

          <div className="flex-1 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-3.5 w-3.5" />
              時程
            </div>
            <div className="text-sm font-medium">
              {new Date(project.startDate).toLocaleDateString('zh-TW')} — {new Date(project.endDate).toLocaleDateString('zh-TW')}
            </div>
            <div className="text-sm text-muted-foreground">剩餘 {daysLeft} 天</div>
          </div>

          {user?.role !== 'member' && (
            <div className="flex-1 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="h-3.5 w-3.5" />
                預算
              </div>
              <span className="text-xl font-bold">{budgetUtilization}%</span>
              <div className="text-sm text-muted-foreground">
                ${(project.budgetUsed / 1000000).toFixed(1)}M / ${(project.budget / 1000000).toFixed(1)}M
              </div>
            </div>
          )}

          <div className="flex-1 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" />
              團隊
            </div>
            <span className="text-xl font-bold">{project.team.length}</span>
            <div className="text-sm text-muted-foreground">當責：{project.teamMembers?.find(m => m.role === 'A')?.name ?? project.owner}</div>
          </div>

          <div className="flex-1 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Milestone className="h-3.5 w-3.5" />
              里程碑
            </div>
            <span className="text-xl font-bold">{completedMilestones}<span className="text-sm font-normal text-muted-foreground">/{project.milestones.length}</span></span>
            <div className="text-sm text-muted-foreground">已完成</div>
          </div>
        </div>

        {/* Tabs - Prominent with icons */}
        <Tabs defaultValue="overview" className="space-y-4">
          <div className="border-b">
            <TabsList className="h-auto p-0 bg-transparent gap-0">
              <TabsTrigger value="overview" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5">
                <Info className="h-4 w-4" />
                概覽
              </TabsTrigger>
              <TabsTrigger value="work-items" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5">
                <ListTodo className="h-4 w-4" />
                工作項目
              </TabsTrigger>
              <TabsTrigger value="updates" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5">
                <History className="h-4 w-4" />
                更新紀錄
              </TabsTrigger>
              <TabsTrigger value="risks" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5">
                <Shield className="h-4 w-4" />
                風險
                {openRisks.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-sm">
                    {openRisks.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="delays" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5">
                <TimerReset className="h-4 w-4" />
                延遲紀錄
                {pendingDelays.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-sm">
                    {pendingDelays.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            <div className="grid gap-4 lg:grid-cols-5">
              {/* Project Info - Left 3 cols */}
              <Card className="lg:col-span-3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    專案資訊
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <div className="grid gap-0 divide-y">
                    <div className="py-3 first:pt-0">
                      <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3" />
                        開案原因
                      </div>
                      <p className="text-sm">{project.createdReason}</p>
                    </div>
                    <div className="py-3">
                      <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                        <Target className="h-3 w-3" />
                        專案目的
                      </div>
                      <p className="text-sm">{project.purpose}</p>
                    </div>
                    <div className="py-3">
                      <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                        <LayoutList className="h-3 w-3" />
                        專案範圍
                      </div>
                      <p className="text-sm">{project.scope}</p>
                    </div>
                    <div className="py-3 last:pb-0">
                      <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3" />
                        投資報酬 (ROI)
                      </div>
                      <p className="text-sm">{project.roi}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Progress Summary - Right 2 cols */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    進度摘要
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TooltipProvider delayDuration={200}>
                    <div className="divide-y">
                      <div className="flex items-center justify-between py-2.5 first:pt-0">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <Milestone className="h-3.5 w-3.5" />
                          已完成里程碑
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px]">
                              <p className="text-sm">里程碑是專案的階段性交付目標，整體進度 = 所有里程碑進度的平均值</p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                        <span className="font-medium">{completedMilestones} / {project.milestones.length}</span>
                      </div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          已完成任務
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px]">
                              <p className="text-sm">任務是里程碑下的具體工作項目，可在「工作項目」頁籤中查看與管理</p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                        <span className="font-medium">
                          {project.tasks.filter(t => t.status === 'done').length} / {project.tasks.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          未處理風險
                        </span>
                        <span className={`font-medium ${openRisks.length > 0 ? 'text-destructive' : ''}`}>
                          {openRisks.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2.5 last:pb-0">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <History className="h-3.5 w-3.5" />
                          最近活動
                        </span>
                        <span className="font-medium">
                          {project.taskLogs.length > 0
                            ? new Date(project.taskLogs[0].createdAt).toLocaleDateString('zh-TW')
                            : '尚無紀錄'
                          }
                        </span>
                      </div>
                    </div>
                  </TooltipProvider>

                  {/* Team members */}
                  <Separator className="my-3" />
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Users className="h-3 w-3" />
                      團隊成員
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(project.teamMembers ?? project.team.map(n => ({ id: n, name: n, role: 'R' as const, responsibility: '', jobTitle: '' }))).map(member => {
                        const roleLabel = TEAM_ROLE_LABELS[member.role as TeamRole] || member.role
                        const isAccountable = member.role === 'A'
                        return (
                          <Badge key={member.id ?? member.name} variant={isAccountable ? 'default' : 'secondary'} className="text-sm">
                            {member.name}
                            {member.jobTitle && <span className="text-muted-foreground ml-1">({member.jobTitle})</span>}
                            <span className="ml-1 opacity-70">{roleLabel}</span>
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Work Items Tab (Milestones + Tasks unified view) */}
          <TabsContent value="work-items" className="mt-0">
            <MilestoneTaskView
              project={project}
              onBaselineReset={async () => {
                const res = await fetch(`/api/projects/${id}`)
                if (res.ok) setProject(await res.json())
              }}
            />
          </TabsContent>

          {/* Updates Tab — Auto-generated weekly summaries */}
          <TabsContent value="updates" className="mt-0">
            <WeeklyActivitySummary project={project} />
          </TabsContent>

          {/* Risks Tab — Static risks from project creation */}
          <TabsContent value="risks" className="mt-0">
            <ProjectRiskTab project={project} />
          </TabsContent>

          {/* Delays Tab */}
          <TabsContent value="delays" className="mt-0">
            <div className="space-y-3">
              {project.delayRequests.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-success" />
                    <p className="text-sm text-muted-foreground">沒有延遲紀錄</p>
                  </CardContent>
                </Card>
              ) : (
                project.delayRequests.map((request) => (
                  <Card key={request.id} className={request.status === 'pending' ? 'border-warning/50' : ''}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TimerReset className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">延遲申請</span>
                          <span className="text-sm text-muted-foreground">
                            {request.requestedBy} · {new Date(request.requestedAt).toLocaleDateString('zh-TW')}
                          </span>
                        </div>
                        <Badge variant={
                          request.status === 'pending' ? 'secondary'
                          : request.status === 'approved' ? 'default'
                          : 'destructive'
                        } className={`text-sm ${request.status === 'pending' ? 'bg-warning text-warning-foreground' : ''}`}>
                          {request.status === 'pending' ? '待審核' : request.status === 'approved' ? '已核准' : '已駁回'}
                        </Badge>
                      </div>

                      <Separator />

                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">延遲原因</div>
                        <p className="text-sm">{request.reason}</p>
                      </div>

                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-2">受影響里程碑</div>
                        <div className="space-y-1.5">
                          {request.affectedMilestones.map((am) => {
                            const ms = project.milestones.find(m => m.id === am.milestoneId)
                            const days = Math.ceil(
                              (new Date(am.proposedDate).getTime() - new Date(am.originalDate).getTime()) / (1000 * 60 * 60 * 24)
                            )
                            return (
                              <div key={am.milestoneId} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                                <span className="font-medium">{ms?.name || am.milestoneId}</span>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-muted-foreground line-through">
                                    {new Date(am.originalDate).toLocaleDateString('zh-TW')}
                                  </span>
                                  <span>→</span>
                                  <span className="text-warning font-medium">
                                    {new Date(am.proposedDate).toLocaleDateString('zh-TW')}
                                  </span>
                                  <Badge variant="outline" className="text-sm">+{days}天</Badge>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {request.supportNeeded && (
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1">需要的支援</div>
                          <p className="text-sm">{request.supportNeeded}</p>
                        </div>
                      )}

                      {request.reviewedBy && (
                        <div className="p-2.5 rounded-lg border bg-muted/50">
                          <div className="text-sm text-muted-foreground mb-1">
                            審核人：{request.reviewedBy} · {request.reviewedAt && new Date(request.reviewedAt).toLocaleDateString('zh-TW')}
                          </div>
                          {request.reviewNotes && (
                            <p className="text-sm">{request.reviewNotes}</p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Dependencies Tab */}
        </Tabs>
      </div>

      {/* Edit / Delete Dialogs */}
      {editOpen && (
        <ProjectEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          project={project}
          onSave={handleSaveProject}
          onTeamChange={async () => {
            const res = await fetch(`/api/projects/${id}`)
            if (res.ok) setProject(await res.json())
          }}
          onRiskChange={async () => {
            const res = await fetch(`/api/projects/${id}`)
            if (res.ok) setProject(await res.json())
          }}
          onWorkItemsChange={async () => {
            const res = await fetch(`/api/projects/${id}`)
            if (res.ok) setProject(await res.json())
          }}
        />
      )}
      <ProjectDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        project={project}
        onConfirm={handleDeleteProject}
      />
    </DashboardLayout>
  )
}
