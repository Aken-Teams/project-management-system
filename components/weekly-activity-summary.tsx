'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  Calendar,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileText,
  History,
  Info,
  LayoutGrid,
  Loader2,
  Search,
  Sparkles,
  TimerReset,
  ArrowRight,
  User,
  X,
  Paperclip,
} from 'lucide-react'
import { type Project, type TaskLogAttachment } from '@/lib/mock-data'

// --- Helpers ---

function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr)
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

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

interface WeekDelayRequest {
  id: string
  requestedBy: string
  requestedAt: string
  reason: string
  type?: 'delay' | 'date_change'
  status: 'pending' | 'approved' | 'rejected'
  taskTitle?: string
  affectedMilestones: { milestoneName: string; originalDate: string; proposedDate: string; delayDays: number }[]
}

interface WeekActivity {
  weekMonday: string
  completedTasks: { taskId: string; taskName: string; completedBy: string; assignee: string; completedAt: string; milestoneName: string }[]
  logs: { logId: string; taskId: string; taskName: string; milestoneName: string; author: string; assignee: string; content: string; logDate: string; nextPlans?: { date?: string; content: string }[]; attachments?: TaskLogAttachment[] }[]
  delayRequests: WeekDelayRequest[]
  activeMembers: Set<string>
}

function buildWeeklyActivities(project: Project): WeekActivity[] {
  const weekMap = new Map<string, WeekActivity>()

  const getOrCreate = (weekMonday: string): WeekActivity => {
    if (!weekMap.has(weekMonday)) {
      weekMap.set(weekMonday, { weekMonday, completedTasks: [], logs: [], delayRequests: [], activeMembers: new Set() })
    }
    return weekMap.get(weekMonday)!
  }

  project.tasks.filter(t => !t.parentId).forEach(task => {
    if (task.completedAt) {
      const monday = getWeekMonday(task.completedAt)
      const milestone = project.milestones.find(m => m.id === task.milestoneId)
      const week = getOrCreate(monday)
      week.completedTasks.push({
        taskId: task.id,
        taskName: task.title,
        completedBy: task.completedBy || task.assignee,
        assignee: task.assignee,
        completedAt: task.completedAt,
        milestoneName: milestone?.name || '',
      })
      week.activeMembers.add(task.assignee)
    }
  })

  project.taskLogs.forEach(log => {
    const monday = getWeekMonday(log.logDate)
    const task = project.tasks.find(t => t.id === log.taskId)
    const milestone = task ? project.milestones.find(m => m.id === task.milestoneId) : null
    const week = getOrCreate(monday)
    const assignee = task?.assignee || log.author
    week.logs.push({
      logId: log.id,
      taskId: log.taskId,
      taskName: task?.title || log.taskId,
      milestoneName: milestone?.name || '',
      author: log.author,
      assignee,
      content: log.content,
      logDate: log.logDate,
      nextPlans: log.nextPlans,
      attachments: log.attachments,
    })
    week.activeMembers.add(assignee)
  })

  // Delay requests
  project.delayRequests?.forEach(dr => {
    const monday = getWeekMonday(dr.requestedAt)
    const week = getOrCreate(monday)
    week.delayRequests.push({
      id: dr.id,
      requestedBy: dr.requestedBy,
      requestedAt: dr.requestedAt,
      reason: dr.reason,
      type: dr.type,
      status: dr.status,
      taskTitle: dr.taskTitle,
      affectedMilestones: dr.affectedMilestones.map(am => {
        const ms = project.milestones.find(m => m.id === am.milestoneId)
        const days = Math.ceil((new Date(am.proposedDate).getTime() - new Date(am.originalDate).getTime()) / (1000 * 60 * 60 * 24))
        return { milestoneName: ms?.name || am.milestoneId, originalDate: am.originalDate, proposedDate: am.proposedDate, delayDays: days }
      }),
    })
  })

  return Array.from(weekMap.values()).sort((a, b) => b.weekMonday.localeCompare(a.weekMonday))
}

const WEEKS_PER_PAGE = 4

// --- Component ---

export function WeeklyActivitySummary({ project }: { project: Project }) {
  const allWeeks = useMemo(() => buildWeeklyActivities(project), [project])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedWeekMonday, setSelectedWeekMonday] = useState<string | null>(null)
  const [weekFilter, setWeekFilter] = useState<string>('')
  const [viewMode, setViewMode] = useState<'matrix' | 'summary'>('summary')
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(new Set())
  const [collapsedMs, setCollapsedMs] = useState<Set<string>>(new Set())
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set())
  const [expandedDelays, setExpandedDelays] = useState<Set<string>>(new Set())

  // Default: only expand the newest week, collapse the rest
  const [initializedCollapse, setInitializedCollapse] = useState(false)
  useEffect(() => {
    if (initializedCollapse || allWeeks.length === 0) return
    const collapsed = new Set(allWeeks.slice(1).map(w => w.weekMonday))
    setCollapsedWeeks(collapsed)
    setInitializedCollapse(true)
  }, [allWeeks, initializedCollapse])

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

  // Available week numbers for filter dropdown
  const availableWeeks = useMemo(() => {
    const weeks = allWeeks.map(w => {
      const weekNum = getISOWeekNumber(w.weekMonday)
      const year = new Date(w.weekMonday).getFullYear()
      const key = `${year}W${String(weekNum).padStart(2, '0')}`
      return { weekMonday: w.weekMonday, weekNum, year, key }
    })
    return [...new Map(weeks.map(w => [w.key, w])).values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [allWeeks])

  // Date + week filtered weeks for matrix (no member/search filter)
  const matrixWeeks = useMemo(() => {
    return allWeeks.filter(week => {
      if (dateFrom && getWeekSunday(week.weekMonday) < dateFrom) return false
      if (dateTo && week.weekMonday > dateTo) return false
      if (weekFilter) {
        const wn = getISOWeekNumber(week.weekMonday)
        const yr = new Date(week.weekMonday).getFullYear()
        const key = `${yr}W${String(wn).padStart(2, '0')}`
        if (key !== weekFilter) return false
      }
      return true
    })
  }, [allWeeks, dateFrom, dateTo, weekFilter])

  const projectMembers = useMemo(() => [...new Set(project.team)].sort(), [project.team])

  const totalPages = Math.max(1, Math.ceil(matrixWeeks.length / WEEKS_PER_PAGE))
  const safePage = Math.min(page, totalPages - 1)
  const pagedMatrixWeeks = matrixWeeks.slice(safePage * WEEKS_PER_PAGE, (safePage + 1) * WEEKS_PER_PAGE)

  // Summary mode: apply member/search filters at the week level
  const summaryFilteredWeeks = useMemo(() => {
    return matrixWeeks.filter(week => {
      if (selectedMember) {
        const hasLogs = week.logs.some(l => l.assignee === selectedMember)
        const hasCompleted = week.completedTasks.some(ct => ct.assignee === selectedMember)
        if (!hasLogs && !hasCompleted) return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const logsMatch = week.logs.some(l =>
          l.taskName.toLowerCase().includes(q) || l.author.toLowerCase().includes(q) || l.content.toLowerCase().includes(q)
        )
        const completedMatch = week.completedTasks.some(ct =>
          ct.taskName.toLowerCase().includes(q) || ct.completedBy.toLowerCase().includes(q) || ct.milestoneName.toLowerCase().includes(q)
        )
        if (!logsMatch && !completedMatch) return false
      }
      return true
    })
  }, [matrixWeeks, selectedMember, searchQuery])

  const summaryTotalPages = Math.max(1, Math.ceil(summaryFilteredWeeks.length / WEEKS_PER_PAGE))
  const safeSummaryPage = Math.min(page, summaryTotalPages - 1)
  const pagedSummaryWeeks = summaryFilteredWeeks.slice(safeSummaryPage * WEEKS_PER_PAGE, (safeSummaryPage + 1) * WEEKS_PER_PAGE)

  // Members with active tasks but no recent logs
  const missingUpdateMembers = useMemo(() => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentLogAuthors = new Set<string>()
    project.taskLogs.forEach(log => {
      if (new Date(log.logDate) >= sevenDaysAgo) {
        const task = project.tasks.find(t => t.id === log.taskId)
        recentLogAuthors.add(task?.assignee || log.author)
      }
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
          <Select value={weekFilter || '__all__'} onValueChange={v => { setWeekFilter(v === '__all__' ? '' : v); setPage(0) }}>
            <SelectTrigger className="h-8 text-sm w-[140px] gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部週別</SelectItem>
              {availableWeeks.map(w => (
                <SelectItem key={w.key} value={w.key}>{w.key}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {weekFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => { setWeekFilter(''); setPage(0) }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
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

        <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
          <Button
            variant={viewMode === 'summary' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1 px-2.5"
            onClick={() => { setViewMode('summary'); setPage(0) }}
          >
            <FileText className="h-3.5 w-3.5" />
            週報彙整
          </Button>
          <Button
            variant={viewMode === 'matrix' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1 px-2.5"
            onClick={() => { setViewMode('matrix'); setPage(0) }}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            監控矩陣
          </Button>
        </div>

        <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="hidden h-8 text-sm gap-1.5 ml-auto"
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
          {(() => {
            const filtered = viewMode === 'matrix' ? matrixWeeks : summaryFilteredWeeks
            return filtered.length !== allWeeks.length
              ? `，篩選結果：${filtered.length} 週`
              : `，共 ${allWeeks.length} 週活動`
          })()}
        </p>
        {viewMode === 'matrix' && missingUpdateMembers.length > 0 && (
          <p className="text-sm text-warning flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {missingUpdateMembers.join('、')} 7 天內未更新
          </p>
        )}
      </div>

      {viewMode === 'matrix' ? (
      <>
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
                          const logCount = week.logs.filter(l => l.assignee === member).length
                          const completedCount = week.completedTasks.filter(ct => ct.assignee === member).length
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
                  detailLogs = detailLogs.filter(l => l.assignee === selectedMember)
                  detailCompleted = detailCompleted.filter(ct => ct.assignee === selectedMember)
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
                                {log.attachments && log.attachments.length > 0 && (
                                  <div className="mt-1.5 space-y-1">
                                    {log.attachments.filter(a => a.type === 'image').length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {log.attachments.filter(a => a.type === 'image').map((att, ai) => (
                                          <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer">
                                            <img src={att.url} alt={att.name} className="h-16 w-16 object-cover rounded border border-border/50 hover:opacity-80 transition-opacity" />
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                    {log.attachments.filter(a => a.type === 'file').map((att, ai) => (
                                      <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                                        <Paperclip className="h-3 w-3 shrink-0" /><span className="truncate">{att.name}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
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
      </>
      ) : (
      /* Weekly Summary Mode */
      pagedSummaryWeeks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">無符合條件的紀錄</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pagedSummaryWeeks.map(week => {
            const sunday = getWeekSunday(week.weekMonday)
            const weekNum = getISOWeekNumber(week.weekMonday)
            const mondayLabel = new Date(week.weekMonday).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
            const sundayLabel = new Date(sunday).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })

            // Apply member + search filters
            let filteredLogs = week.logs
            let filteredCompleted = week.completedTasks
            if (selectedMember) {
              filteredLogs = filteredLogs.filter(l => l.author === selectedMember)
              filteredCompleted = filteredCompleted.filter(ct => ct.completedBy === selectedMember)
            }
            if (searchQuery.trim()) {
              const q = searchQuery.trim().toLowerCase()
              filteredLogs = filteredLogs.filter(l =>
                l.taskName.toLowerCase().includes(q) || l.author.toLowerCase().includes(q) || l.content.toLowerCase().includes(q)
              )
              filteredCompleted = filteredCompleted.filter(ct =>
                ct.taskName.toLowerCase().includes(q) || ct.completedBy.toLowerCase().includes(q) || ct.milestoneName.toLowerCase().includes(q)
              )
            }

            // Build parent-child map
            const subtaskOf = new Map<string, string>()
            project.tasks.forEach(t => { if (t.parentId) subtaskOf.set(t.id, t.parentId) })

            // Group by milestone → task (with subtask nesting)
            type SubEntry = { taskId: string; taskName: string; assignee?: string; completed?: { completedBy: string; completedAt: string }; logs: typeof filteredLogs }
            type TaskEntry = {
              taskId: string; taskName: string; assignee?: string
              completed?: { completedBy: string; completedAt: string }
              logs: typeof filteredLogs
              subtasks: SubEntry[]
            }
            const milestoneMap = new Map<string, TaskEntry[]>()
            const getMs = (msName: string) => {
              if (!milestoneMap.has(msName)) milestoneMap.set(msName, [])
              return milestoneMap.get(msName)!
            }
            const findOrAdd = (list: TaskEntry[], id: string, name: string, assignee?: string) => {
              let t = list.find(e => e.taskId === id)
              if (!t) { t = { taskId: id, taskName: name, assignee, logs: [], subtasks: [] }; list.push(t) }
              if (assignee && !t.assignee) t.assignee = assignee
              return t
            }
            const findOrAddSub = (task: TaskEntry, id: string, name: string, assignee?: string) => {
              let s = task.subtasks.find(e => e.taskId === id)
              if (!s) { s = { taskId: id, taskName: name, assignee, logs: [] }; task.subtasks.push(s) }
              if (assignee && !s.assignee) s.assignee = assignee
              return s
            }

            filteredLogs.forEach(log => {
              const parentId = subtaskOf.get(log.taskId)
              if (parentId) {
                const parentTask = project.tasks.find(t => t.id === parentId)
                const subTask = project.tasks.find(t => t.id === log.taskId)
                const tasks = getMs(log.milestoneName)
                const parent = findOrAdd(tasks, parentId, parentTask?.title || parentId, parentTask?.assignee)
                const sub = findOrAddSub(parent, log.taskId, log.taskName, subTask?.assignee)
                sub.logs.push(log)
              } else {
                const taskData = project.tasks.find(t => t.id === log.taskId)
                const tasks = getMs(log.milestoneName)
                const t = findOrAdd(tasks, log.taskId, log.taskName, taskData?.assignee)
                t.logs.push(log)
              }
            })
            filteredCompleted.forEach(ct => {
              const tasks = getMs(ct.milestoneName)
              const taskData = project.tasks.find(tk => tk.id === ct.taskId)
              const t = findOrAdd(tasks, ct.taskId, ct.taskName, taskData?.assignee)
              t.completed = { completedBy: ct.completedBy, completedAt: ct.completedAt }
            })

            // Sort milestones by project order, sort logs by date
            const msOrder = new Map(project.milestones.map((m, i) => [m.name, i]))
            const sortedMilestoneEntries = Array.from(milestoneMap.entries()).sort((a, b) => {
              const ia = msOrder.get(a[0]) ?? 999
              const ib = msOrder.get(b[0]) ?? 999
              return ia - ib
            })
            milestoneMap.forEach(tasks => tasks.forEach(t => {
              t.logs.sort((a, b) => a.logDate.localeCompare(b.logDate))
              t.subtasks.forEach(s => s.logs.sort((a, b) => a.logDate.localeCompare(b.logDate)))
            }))

            // Filter delay requests
            let filteredDelayRequests = week.delayRequests
            if (selectedMember) {
              filteredDelayRequests = filteredDelayRequests.filter(dr => dr.requestedBy === selectedMember)
            }
            if (searchQuery.trim()) {
              const q = searchQuery.trim().toLowerCase()
              filteredDelayRequests = filteredDelayRequests.filter(dr =>
                dr.reason.toLowerCase().includes(q) || dr.requestedBy.toLowerCase().includes(q) ||
                dr.affectedMilestones.some(am => am.milestoneName.toLowerCase().includes(q))
              )
            }

            const fmtDate = (d: string) => new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
            const isEmpty = filteredLogs.length === 0 && filteredCompleted.length === 0 && filteredDelayRequests.length === 0

            const isWeekCollapsed = collapsedWeeks.has(week.weekMonday)

            return (
              <Card key={week.weekMonday}>
                <div
                  className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCollapsedWeeks(prev => { const s = new Set(prev); s.has(week.weekMonday) ? s.delete(week.weekMonday) : s.add(week.weekMonday); return s })}
                >
                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isWeekCollapsed ? '-rotate-90' : ''}`} />
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-sm">{new Date(week.weekMonday).getFullYear()}W{String(weekNum).padStart(2, '0')}：{mondayLabel} ~ {sundayLabel}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {filteredCompleted.length > 0 && `${filteredCompleted.length} 完成`}
                    {filteredCompleted.length > 0 && filteredLogs.length > 0 && '　'}
                    {filteredLogs.length > 0 && `${filteredLogs.length} 筆紀錄`}
                  </span>
                </div>

                {isWeekCollapsed ? null : isEmpty ? (
                  <p className="text-sm text-muted-foreground text-center py-4">此週無紀錄</p>
                ) : (
                  <div className="divide-y">
                    {sortedMilestoneEntries.map(([msName, tasks]) => {
                      const msKey = `${week.weekMonday}-${msName}`
                      const isMsCollapsed = collapsedMs.has(msKey)
                      return (
                        <div key={msName}>
                          {/* Milestone header — collapsible */}
                          <button
                            onClick={() => setCollapsedMs(prev => { const s = new Set(prev); s.has(msKey) ? s.delete(msKey) : s.add(msKey); return s })}
                            className="w-full px-4 py-2 bg-primary/5 border-b flex items-center gap-1.5 hover:bg-primary/10 transition-colors text-left"
                          >
                            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isMsCollapsed ? '-rotate-90' : ''}`} />
                            <span className="text-sm font-semibold text-foreground/70">{msName || '未分類'}</span>
                            <span className="text-xs text-muted-foreground/50 ml-auto">{tasks.length} 項任務</span>
                          </button>
                          {/* Tasks under this milestone */}
                          {!isMsCollapsed && (
                            <div className="divide-y">
                              {tasks.map(task => {
                                const hasSubtasks = task.subtasks.length > 0
                                const taskKey = `${week.weekMonday}-${task.taskId}`
                                const isTaskCollapsed = collapsedTasks.has(taskKey)
                                return (
                                  <div key={task.taskId}>
                                    <div className="flex">
                                      {/* Left: task name + status */}
                                      <div
                                        className={`w-[180px] shrink-0 px-4 py-2.5 border-r bg-muted/5 ${hasSubtasks ? 'cursor-pointer hover:bg-muted/20 transition-colors' : ''}`}
                                        onClick={() => hasSubtasks && setCollapsedTasks(prev => { const s = new Set(prev); s.has(taskKey) ? s.delete(taskKey) : s.add(taskKey); return s })}
                                      >
                                        <div className="flex items-start gap-1.5">
                                          {hasSubtasks && (
                                            <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform shrink-0 mt-0.5 -ml-1 ${isTaskCollapsed ? '-rotate-90' : ''}`} />
                                          )}
                                          {task.completed && <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />}
                                          <span className={`text-sm font-medium break-words ${task.completed ? 'text-success' : ''}`}>{task.taskName}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                          {task.assignee && (
                                            <span className="text-[11px] text-muted-foreground">{task.assignee}</span>
                                          )}
                                          {task.assignee && task.completed && (
                                            <span className="text-[11px] text-muted-foreground/30">|</span>
                                          )}
                                          {task.completed && (
                                            <span className="text-[11px] text-success/70">{fmtDate(task.completed.completedAt)} 完成</span>
                                          )}
                                        </div>
                                      </div>
                                      {/* Right: log entries + nextPlans on far right */}
                                      <div className="flex-1 min-w-0 divide-y divide-dashed">
                                        {task.logs.length === 0 && (
                                          <div className="px-3 py-2.5 text-xs text-muted-foreground italic">—</div>
                                        )}
                                        {task.logs.map(log => (
                                          <div key={log.logId} className="px-3 py-2 flex gap-3">
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(log.logDate)}</span>
                                              </div>
                                              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{log.content}</p>
                                              {log.attachments && log.attachments.length > 0 && (
                                                <div className="mt-1 space-y-1">
                                                  {log.attachments.filter(a => a.type === 'image').length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                      {log.attachments.filter(a => a.type === 'image').map((att, ai) => (
                                                        <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer">
                                                          <img src={att.url} alt={att.name} className="h-14 w-14 object-cover rounded border border-border/50 hover:opacity-80 transition-opacity" />
                                                        </a>
                                                      ))}
                                                    </div>
                                                  )}
                                                  {log.attachments.filter(a => a.type === 'file').map((att, ai) => (
                                                    <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                                                      <Paperclip className="h-3 w-3 shrink-0" /><span className="truncate">{att.name}</span>
                                                    </a>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                            {log.nextPlans && log.nextPlans.length > 0 && (
                                              <div className="shrink-0 w-[180px] border-l pl-3 flex flex-col gap-0.5 justify-center">
                                                <span className="text-[10px] text-muted-foreground/50 font-medium">預計後續</span>
                                                {log.nextPlans.map((plan, pi) => (
                                                  <span key={pi} className="text-xs text-primary/60">
                                                    {plan.date ? `${fmtDate(plan.date)} ` : ''}{plan.content}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    {/* Subtask entries (collapsible) */}
                                    {hasSubtasks && !isTaskCollapsed && task.subtasks.map(sub => (
                                      <div key={sub.taskId} className="flex border-t">
                                        <div className="w-[180px] shrink-0 pl-4 pr-4 py-2 border-r bg-muted/5">
                                          <div className="flex items-start gap-1.5">
                                            {/* L-shaped connector */}
                                            <span className="inline-block w-4 h-4 border-l-2 border-b-2 border-muted-foreground/30 rounded-bl-sm -mt-2 shrink-0" />
                                            {sub.completed && <CheckCircle2 className="h-3 w-3 text-success shrink-0" />}
                                            <span className="text-xs font-medium break-words text-muted-foreground">{sub.taskName}</span>
                                          </div>
                                          {sub.assignee && (
                                            <div className="flex items-center gap-1.5 mt-0.5 pl-[22px]">
                                              <span className="text-[11px] text-muted-foreground">{sub.assignee}</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0 divide-y divide-dashed">
                                          {sub.logs.map(log => (
                                            <div key={log.logId} className="px-3 py-2 flex gap-3">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                  <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(log.logDate)}</span>
                                                </div>
                                                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{log.content}</p>
                                                {log.attachments && log.attachments.length > 0 && (
                                                  <div className="mt-1 space-y-1">
                                                    {log.attachments.filter(a => a.type === 'image').length > 0 && (
                                                      <div className="flex flex-wrap gap-1">
                                                        {log.attachments.filter(a => a.type === 'image').map((att, ai) => (
                                                          <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer">
                                                            <img src={att.url} alt={att.name} className="h-14 w-14 object-cover rounded border border-border/50 hover:opacity-80 transition-opacity" />
                                                          </a>
                                                        ))}
                                                      </div>
                                                    )}
                                                    {log.attachments.filter(a => a.type === 'file').map((att, ai) => (
                                                      <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                                                        <Paperclip className="h-3 w-3 shrink-0" /><span className="truncate">{att.name}</span>
                                                      </a>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                              {log.nextPlans && log.nextPlans.length > 0 && (
                                                <div className="shrink-0 w-[180px] border-l pl-3 flex flex-col gap-0.5 justify-center">
                                                  {log.nextPlans.map((plan, pi) => (
                                                    <span key={pi} className="text-xs text-primary/60">
                                                      {plan.date ? `${fmtDate(plan.date)} ` : ''}{plan.content}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Delay Requests — collapsed by default */}
                {!isWeekCollapsed && filteredDelayRequests.length > 0 && (() => {
                  const delayKey = week.weekMonday
                  const isDelayExpanded = expandedDelays.has(delayKey)
                  return (
                  <div className="border-t">
                    <div
                      className="px-4 py-2 bg-orange-50/50 dark:bg-orange-950/10 flex items-center gap-1.5 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors"
                      onClick={() => setExpandedDelays(prev => { const s = new Set(prev); s.has(delayKey) ? s.delete(delayKey) : s.add(delayKey); return s })}
                    >
                      <ChevronDown className={`h-3.5 w-3.5 text-orange-500 transition-transform ${isDelayExpanded ? '' : '-rotate-90'}`} />
                      <TimerReset className="h-3.5 w-3.5 text-orange-500" />
                      <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">延遲 / 日期變更申請</span>
                      <span className="text-xs text-orange-500/60 ml-auto">{filteredDelayRequests.length} 筆</span>
                    </div>
                    {isDelayExpanded && (
                    <div className="divide-y">
                      {filteredDelayRequests.map(dr => (
                        <div key={dr.id} className="px-4 py-2 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${
                              dr.status === 'pending' ? 'border-warning text-warning' :
                              dr.status === 'approved' ? 'border-success text-success' :
                              'border-destructive text-destructive'
                            }`}>
                              {dr.status === 'pending' ? '待審核' : dr.status === 'approved' ? '已核准' : '已駁回'}
                            </Badge>
                            <span className="text-sm text-foreground/80">{dr.reason}</span>
                          </div>
                          {dr.taskTitle && (
                            <div className="text-xs pl-1 text-amber-700 dark:text-amber-400">
                              延期任務：{dr.taskTitle}
                            </div>
                          )}
                          {dr.affectedMilestones.map((am, ai) => (
                            <div key={ai} className="flex items-center gap-2 text-xs pl-1">
                              <span className="font-medium truncate">{am.milestoneName}</span>
                              <span className="text-muted-foreground ml-auto shrink-0">{fmtDate(am.originalDate)}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-orange-600 dark:text-orange-400 font-medium shrink-0">{fmtDate(am.proposedDate)}</span>
                              <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600 dark:text-orange-400 shrink-0">
                                {am.delayDays >= 0 ? '+' : ''}{am.delayDays}天
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                  )
                })()}
              </Card>
            )
          })}
        </div>
      )
      )}

      {/* Pagination */}
      {(() => {
        const currentTotal = viewMode === 'matrix' ? totalPages : summaryTotalPages
        const currentSafe = viewMode === 'matrix' ? safePage : safeSummaryPage
        if (currentTotal <= 1) return null
        return (
          <div className="flex items-center justify-between pt-1">
            <p className="text-sm text-muted-foreground">
              第 {currentSafe + 1} / {currentTotal} 頁
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={currentSafe === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={currentSafe >= currentTotal - 1}
                onClick={() => setPage(p => Math.min(currentTotal - 1, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
