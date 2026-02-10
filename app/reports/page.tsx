'use client'

import { useState, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useProjectStore } from '@/lib/project-store'
import { PROJECT_TYPE_LABELS, type ProjectStatus } from '@/lib/mock-data'
import {
  Mail,
  FileDown,
  CheckCircle2,
  X,
  Printer,
  AlertTriangle,
  Target,
  DollarSign,
  BarChart3,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── SVG Donut Chart ──
function DonutChart({ segments, size = 180, strokeWidth = 26, children }: {
  segments: { value: number; color: string; label: string }[]
  size?: number
  strokeWidth?: number
  children?: React.ReactNode
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  let accumulated = 0

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {total === 0 ? (
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth}
          />
        ) : (
          segments.filter(s => s.value > 0).map((seg, i) => {
            const pct = seg.value / total
            const dashLength = circumference * pct
            const dashOffset = circumference * (1 - accumulated / total)
            accumulated += seg.value
            return (
              <circle
                key={i}
                cx={size / 2} cy={size / 2} r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
              />
            )
          })
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}

// ── Mini ring (for project cards) ──
function MiniRing({ value, size = 44, strokeWidth = 5, color }: {
  value: number; size?: number; strokeWidth?: number; color: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashLen = circumference * (value / 100)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${dashLen} ${circumference - dashLen}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-[10px] font-bold">{value}%</span>
    </div>
  )
}

// ── Status dot ──
function StatusDot({ status }: { status: ProjectStatus }) {
  const colors: Record<ProjectStatus, string> = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-400',
    red: 'bg-red-500',
  }
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full', colors[status])} />
}

function fmtMoney(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n}`
}

export default function ReportsPage() {
  const { projects } = useProjectStore()
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [showPdfDialog, setShowPdfDialog] = useState(false)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [emailRecipients, setEmailRecipients] = useState('')
  const [selectedReports, setSelectedReports] = useState<string[]>(['summary', 'tasks', 'milestones'])
  const [exportSuccess, setExportSuccess] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)

  const selectedProject = selectedProjectId === 'all'
    ? null
    : projects.find(p => p.id === selectedProjectId)

  const targetProjects = selectedProject ? [selectedProject] : projects

  // ── Aggregate stats ──
  const stats = useMemo(() => {
    const ps = targetProjects
    const totalTasks = ps.reduce((a, p) => a + p.tasks.length, 0)
    const doneTasks = ps.reduce((a, p) => a + p.tasks.filter(t => t.status === 'done').length, 0)
    const inProgressTasks = ps.reduce((a, p) => a + p.tasks.filter(t => t.status === 'in-progress').length, 0)
    const blockedTasks = ps.reduce((a, p) => a + p.tasks.filter(t => t.status === 'blocked').length, 0)
    const todoTasks = totalTasks - doneTasks - inProgressTasks - blockedTasks

    const totalMilestones = ps.reduce((a, p) => a + p.milestones.length, 0)
    const doneMilestones = ps.reduce((a, p) => a + p.milestones.filter(m => m.status === 'done').length, 0)

    const budget = ps.reduce((a, p) => a + p.budget, 0)
    const budgetUsed = ps.reduce((a, p) => a + p.budgetUsed, 0)
    const openRisks = ps.reduce((a, p) => a + p.risks.filter(r => r.status === 'open').length, 0)
    const pendingDelays = ps.reduce((a, p) => a + p.delayRequests.filter(r => r.status === 'pending').length, 0)
    const teamSize = new Set(ps.flatMap(p => p.team)).size
    const progress = ps.length > 0 ? Math.round(ps.reduce((a, p) => a + p.progress, 0) / ps.length) : 0

    return {
      totalTasks, doneTasks, inProgressTasks, blockedTasks, todoTasks,
      totalMilestones, doneMilestones,
      budget, budgetUsed,
      openRisks, pendingDelays, teamSize, progress,
    }
  }, [targetProjects])

  const budgetPct = stats.budget > 0 ? Math.round((stats.budgetUsed / stats.budget) * 100) : 0

  // ── Donut segments ──
  const taskSegments = [
    { value: stats.doneTasks, color: '#10b981', label: '已完成' },
    { value: stats.inProgressTasks, color: '#3b82f6', label: '進行中' },
    { value: stats.todoTasks, color: '#94a3b8', label: '待辦' },
    { value: stats.blockedTasks, color: '#ef4444', label: '受阻' },
  ]

  const statusSegments = useMemo(() => {
    const green = projects.filter(p => p.status === 'green').length
    const yellow = projects.filter(p => p.status === 'yellow').length
    const red = projects.filter(p => p.status === 'red').length
    return [
      { value: green, color: '#10b981', label: '正常' },
      { value: yellow, color: '#f59e0b', label: '注意' },
      { value: red, color: '#ef4444', label: '風險' },
    ]
  }, [projects])

  // ── Member workload ──
  const memberWorkload = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>()
    targetProjects.forEach(p => {
      p.tasks.forEach(t => {
        const entry = map.get(t.assignee) || { total: 0, done: 0 }
        entry.total++
        if (t.status === 'done') entry.done++
        map.set(t.assignee, entry)
      })
    })
    return [...map.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [targetProjects])

  const maxMemberTasks = Math.max(...memberWorkload.map(m => m.total), 1)

  // ── Export handlers ──
  const handleOpenPdfDialog = () => {
    setSelectedProjectIds(projects.map(p => p.id))
    setShowPdfDialog(true)
    setExportSuccess(false)
  }

  const handleOpenEmailDialog = () => {
    setSelectedProjectIds(projects.map(p => p.id))
    setEmailRecipients('')
    setSelectedReports(['summary', 'tasks', 'milestones'])
    setShowEmailDialog(true)
    setEmailSuccess(false)
  }

  const handleToggleProject = (projectId: string) => {
    setSelectedProjectIds(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    )
  }

  const handleSelectAllProjects = () => {
    setSelectedProjectIds(projects.map(p => p.id))
  }

  const handleDeselectAllProjects = () => {
    setSelectedProjectIds([])
  }

  const handleToggleReport = (reportId: string) => {
    setSelectedReports(prev =>
      prev.includes(reportId)
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    )
  }

  const handleExportPdf = () => {
    // Mock PDF export
    setExportSuccess(true)
    setTimeout(() => {
      setShowPdfDialog(false)
      setExportSuccess(false)
    }, 2000)
  }

  const handleSendEmail = () => {
    // Mock email send
    setEmailSuccess(true)
    setTimeout(() => {
      setShowEmailDialog(false)
      setEmailSuccess(false)
    }, 2000)
  }

  const getStatusRingColor = (status: ProjectStatus) => {
    if (status === 'green') return '#3b82f6'
    if (status === 'yellow') return '#f59e0b'
    return '#ef4444'
  }

  return (
    <DashboardLayout>
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">專案報告</h1>
              <p className="text-sm text-muted-foreground mt-1">檢視專案進度與統計分析</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-[200px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有專案（總覽）</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleOpenEmailDialog}>
                <Mail className="h-3.5 w-3.5" /> Email
              </Button>
              <Button size="sm" className="gap-1.5" onClick={handleOpenPdfDialog}>
                <FileDown className="h-3.5 w-3.5" /> 匯出 PDF
              </Button>
            </div>
          </div>

          {/* PDF Export Dialog */}
          <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>匯出 PDF 報告</DialogTitle>
                <DialogDescription>
                  選擇要匯出的專案，系統將產生包含所選專案的完整報告
                </DialogDescription>
              </DialogHeader>

              {exportSuccess ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500" />
                  <p className="font-medium text-emerald-600">PDF 報告已成功匯出！</p>
                  <p className="text-sm text-muted-foreground mt-1">檔案已下載至您的電腦</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">選擇專案</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleSelectAllProjects}
                          className="h-8 text-sm"
                        >
                          全選
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleDeselectAllProjects}
                          className="h-8 text-sm"
                        >
                          清除
                        </Button>
                      </div>
                    </div>

                    <div className="border rounded-lg p-3 space-y-2 max-h-[300px] overflow-y-auto">
                      {projects.map(project => (
                        <div key={project.id} className="flex items-center space-x-3 p-3 rounded hover:bg-muted/50">
                          <Checkbox
                            id={`pdf-project-${project.id}`}
                            checked={selectedProjectIds.includes(project.id)}
                            onCheckedChange={() => handleToggleProject(project.id)}
                            className="h-5 w-5"
                          />
                          <label
                            htmlFor={`pdf-project-${project.id}`}
                            className="flex-1 text-base cursor-pointer flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <StatusDot status={project.status} />
                              <span className="font-medium">{project.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span>{project.progress}%</span>
                              <Badge variant="outline" className="text-xs">
                                {PROJECT_TYPE_LABELS[project.projectType]}
                              </Badge>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      已選擇 {selectedProjectIds.length} 個專案
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowPdfDialog(false)} size="lg">
                      取消
                    </Button>
                    <Button
                      onClick={handleExportPdf}
                      disabled={selectedProjectIds.length === 0}
                      className="gap-2"
                      size="lg"
                    >
                      <FileDown className="h-4 w-4" />
                      下載 PDF ({selectedProjectIds.length})
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* Email Dialog */}
          <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Email 報告</DialogTitle>
                <DialogDescription>
                  輸入收件人並選擇要寄送的報告內容
                </DialogDescription>
              </DialogHeader>

              {emailSuccess ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500" />
                  <p className="font-medium text-emerald-600">Email 已成功發送！</p>
                  <p className="text-sm text-muted-foreground mt-1">報告已寄送至指定收件人</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {/* Email Recipients */}
                    <div className="space-y-2">
                      <Label htmlFor="email-recipients" className="text-base font-medium">
                        收件人
                      </Label>
                      <Input
                        id="email-recipients"
                        type="text"
                        placeholder="輸入 email 地址，多個 email 請用逗號分隔"
                        value={emailRecipients}
                        onChange={(e) => setEmailRecipients(e.target.value)}
                        className="text-base h-11"
                      />
                      <p className="text-sm text-muted-foreground">
                        範例: user1@example.com, user2@example.com
                      </p>
                    </div>

                    {/* Select Projects */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-medium">選擇專案</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleSelectAllProjects}
                            className="h-8 text-sm"
                          >
                            全選
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleDeselectAllProjects}
                            className="h-8 text-sm"
                          >
                            清除
                          </Button>
                        </div>
                      </div>

                      <div className="border rounded-lg p-3 space-y-2 max-h-[200px] overflow-y-auto">
                        {projects.map(project => (
                          <div key={project.id} className="flex items-center space-x-3 p-3 rounded hover:bg-muted/50">
                            <Checkbox
                              id={`email-project-${project.id}`}
                              checked={selectedProjectIds.includes(project.id)}
                              onCheckedChange={() => handleToggleProject(project.id)}
                              className="h-5 w-5"
                            />
                            <label
                              htmlFor={`email-project-${project.id}`}
                              className="flex-1 text-base cursor-pointer flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <StatusDot status={project.status} />
                                <span className="font-medium">{project.name}</span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {PROJECT_TYPE_LABELS[project.projectType]}
                              </Badge>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Select Report Sections */}
                    <div className="space-y-2">
                      <Label className="text-base font-medium">報告內容</Label>
                      <div className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center space-x-3 p-3 rounded hover:bg-muted/50">
                          <Checkbox
                            id="report-summary"
                            checked={selectedReports.includes('summary')}
                            onCheckedChange={() => handleToggleReport('summary')}
                            className="h-5 w-5"
                          />
                          <label htmlFor="report-summary" className="flex-1 cursor-pointer">
                            <div className="font-medium text-base">專案摘要</div>
                            <div className="text-sm text-muted-foreground">包含專案基本資訊、目標、範圍等</div>
                          </label>
                        </div>

                        <div className="flex items-center space-x-3 p-3 rounded hover:bg-muted/50">
                          <Checkbox
                            id="report-tasks"
                            checked={selectedReports.includes('tasks')}
                            onCheckedChange={() => handleToggleReport('tasks')}
                            className="h-5 w-5"
                          />
                          <label htmlFor="report-tasks" className="flex-1 cursor-pointer">
                            <div className="font-medium text-base">任務進度</div>
                            <div className="text-sm text-muted-foreground">任務狀態、完成度、團隊工作量分析</div>
                          </label>
                        </div>

                        <div className="flex items-center space-x-3 p-3 rounded hover:bg-muted/50">
                          <Checkbox
                            id="report-milestones"
                            checked={selectedReports.includes('milestones')}
                            onCheckedChange={() => handleToggleReport('milestones')}
                            className="h-5 w-5"
                          />
                          <label htmlFor="report-milestones" className="flex-1 cursor-pointer">
                            <div className="font-medium text-base">里程碑追蹤</div>
                            <div className="text-sm text-muted-foreground">里程碑達成狀況、時程分析</div>
                          </label>
                        </div>

                        <div className="flex items-center space-x-3 p-3 rounded hover:bg-muted/50">
                          <Checkbox
                            id="report-budget"
                            checked={selectedReports.includes('budget')}
                            onCheckedChange={() => handleToggleReport('budget')}
                            className="h-5 w-5"
                          />
                          <label htmlFor="report-budget" className="flex-1 cursor-pointer">
                            <div className="font-medium text-base">預算執行</div>
                            <div className="text-sm text-muted-foreground">預算使用情況、成本分析</div>
                          </label>
                        </div>

                        <div className="flex items-center space-x-3 p-3 rounded hover:bg-muted/50">
                          <Checkbox
                            id="report-risks"
                            checked={selectedReports.includes('risks')}
                            onCheckedChange={() => handleToggleReport('risks')}
                            className="h-5 w-5"
                          />
                          <label htmlFor="report-risks" className="flex-1 cursor-pointer">
                            <div className="font-medium text-base">風險管理</div>
                            <div className="text-sm text-muted-foreground">未解決風險、延期請求狀態</div>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      已選擇 {selectedProjectIds.length} 個專案，{selectedReports.length} 個報告區塊
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowEmailDialog(false)} size="lg">
                      取消
                    </Button>
                    <Button
                      onClick={handleSendEmail}
                      disabled={!emailRecipients.trim() || selectedProjectIds.length === 0 || selectedReports.length === 0}
                      className="gap-2"
                      size="lg"
                    >
                      <Mail className="h-4 w-4" />
                      發送 Email
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Target className="h-3.5 w-3.5" /> 整體進度
                </div>
                <div className="text-2xl font-bold">{stats.progress}%</div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${stats.progress}%` }} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <DollarSign className="h-3.5 w-3.5" /> 預算執行
                </div>
                <div className={cn('text-2xl font-bold', budgetPct > 100 && 'text-destructive')}>{budgetPct}%</div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', budgetPct > 100 ? 'bg-destructive' : 'bg-emerald-500')} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {fmtMoney(stats.budgetUsed)} / {fmtMoney(stats.budget)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <BarChart3 className="h-3.5 w-3.5" /> 里程碑
                </div>
                <div className="text-2xl font-bold">{stats.doneMilestones}<span className="text-sm font-normal text-muted-foreground">/{stats.totalMilestones}</span></div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${stats.totalMilestones > 0 ? (stats.doneMilestones / stats.totalMilestones) * 100 : 0}%` }} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <AlertTriangle className="h-3.5 w-3.5" /> 風險 / 延期
                </div>
                <div className="flex items-baseline gap-3">
                  <div className={cn('text-2xl font-bold', stats.openRisks > 0 ? 'text-destructive' : 'text-emerald-600')}>
                    {stats.openRisks}
                  </div>
                  {stats.pendingDelays > 0 && (
                    <Badge variant="destructive" className="text-[10px]">{stats.pendingDelays} 待審</Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {stats.openRisks === 0 ? '無未解決風險' : `${stats.openRisks} 個未解決風險`}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Donut Charts — 3-col */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Task Status Donut */}
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">任務狀態分佈</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-5 gap-4">
                <DonutChart segments={taskSegments} size={150} strokeWidth={22}>
                  <div className="text-center">
                    <div className="text-xl font-bold">{stats.totalTasks}</div>
                    <div className="text-[10px] text-muted-foreground">總任務</div>
                  </div>
                </DonutChart>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                  {taskSegments.filter(s => s.value > 0).map(seg => (
                    <div key={seg.label} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="text-xs text-muted-foreground">{seg.label}</span>
                      <span className="text-xs font-semibold">{seg.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Project Health / Milestone Donut */}
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">
                  {selectedProject ? '里程碑狀態' : '專案健康度'}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-5 gap-4">
                {selectedProject ? (
                  <>
                    <DonutChart
                      segments={[
                        { value: selectedProject.milestones.filter(m => m.status === 'done').length, color: '#10b981', label: '完成' },
                        { value: selectedProject.milestones.filter(m => m.status === 'in-progress').length, color: '#3b82f6', label: '進行中' },
                        { value: selectedProject.milestones.filter(m => m.status === 'todo').length, color: '#94a3b8', label: '待辦' },
                        { value: selectedProject.milestones.filter(m => m.status === 'blocked').length, color: '#ef4444', label: '受阻' },
                      ]}
                      size={150} strokeWidth={22}
                    >
                      <div className="text-center">
                        <div className="text-xl font-bold">{selectedProject.progress}%</div>
                        <div className="text-[10px] text-muted-foreground">進度</div>
                      </div>
                    </DonutChart>
                    <div className="w-full space-y-1.5 px-2">
                      {selectedProject.milestones.map(m => (
                        <div key={m.id} className="flex items-center gap-2">
                          <span className={cn(
                            'h-2 w-2 rounded-full shrink-0',
                            m.status === 'done' ? 'bg-emerald-500' :
                            m.status === 'in-progress' ? 'bg-blue-500' :
                            m.status === 'blocked' ? 'bg-red-500' : 'bg-slate-400',
                          )} />
                          <span className="text-[11px] truncate">{m.name}</span>
                          <span className="text-[11px] font-semibold ml-auto">{m.progress}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <DonutChart segments={statusSegments} size={150} strokeWidth={22}>
                      <div className="text-center">
                        <div className="text-xl font-bold">{projects.length}</div>
                        <div className="text-[10px] text-muted-foreground">專案</div>
                      </div>
                    </DonutChart>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                      {statusSegments.filter(s => s.value > 0).map(seg => (
                        <div key={seg.label} className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                          <span className="text-xs text-muted-foreground">{seg.label}</span>
                          <span className="text-xs font-semibold">{seg.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Budget Donut */}
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">預算執行</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-5 gap-4">
                <DonutChart
                  segments={[
                    { value: stats.budgetUsed, color: budgetPct > 100 ? '#ef4444' : budgetPct > 80 ? '#f59e0b' : '#10b981', label: '已使用' },
                    { value: Math.max(stats.budget - stats.budgetUsed, 0), color: '#e2e8f0', label: '剩餘' },
                  ]}
                  size={150} strokeWidth={22}
                >
                  <div className="text-center">
                    <div className={cn('text-xl font-bold', budgetPct > 100 && 'text-destructive')}>{budgetPct}%</div>
                    <div className="text-[10px] text-muted-foreground">執行率</div>
                  </div>
                </DonutChart>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-emerald-500" />
                    <span className="text-xs text-muted-foreground">已使用</span>
                    <span className="text-xs font-semibold">{fmtMoney(stats.budgetUsed)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-slate-200" />
                    <span className="text-xs text-muted-foreground">剩餘</span>
                    <span className="text-xs font-semibold">{fmtMoney(Math.max(stats.budget - stats.budgetUsed, 0))}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* All projects view */}
          {!selectedProject && (
            <>
              {/* Project Progress Cards — mini ring per project */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">各專案進度</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {projects.map(p => {
                      const doneTasks = p.tasks.filter(t => t.status === 'done').length
                      const doneMs = p.milestones.filter(m => m.status === 'done').length
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedProjectId(p.id)}
                          className="p-3 rounded-lg border hover:border-primary/40 hover:shadow-sm transition-all text-left flex items-center gap-3"
                        >
                          <MiniRing value={p.progress} color={getStatusRingColor(p.status)} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{p.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <StatusDot status={p.status} />
                              <span className="text-[10px] text-muted-foreground">{doneTasks}/{p.tasks.length} 任務</span>
                              <span className="text-[10px] text-muted-foreground">{doneMs}/{p.milestones.length} 里程碑</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

            </>
          )}

          {/* Single project view */}
          {selectedProject && (
            <>
              {/* Milestone progress + info in 2 cols */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">里程碑進度</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedProject.milestones.map(m => {
                      const mTasks = selectedProject.tasks.filter(t => t.milestoneId === m.id)
                      const done = mTasks.filter(t => t.status === 'done').length
                      return (
                        <div key={m.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium truncate mr-2">{m.name}</span>
                            <span className="text-muted-foreground shrink-0">{m.progress}% ({done}/{mTasks.length})</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{
                              width: `${m.progress}%`,
                              backgroundColor: m.status === 'done' ? '#10b981' : m.status === 'blocked' ? '#ef4444' : '#3b82f6',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">專案資訊</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="text-[10px] text-muted-foreground mb-1">專案類型</div>
                        <div className="font-medium text-xs">{PROJECT_TYPE_LABELS[selectedProject.projectType]}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="text-[10px] text-muted-foreground mb-1">負責人</div>
                        <div className="font-medium text-xs">{selectedProject.owner}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="text-[10px] text-muted-foreground mb-1">專案期間</div>
                        <div className="font-medium text-xs">
                          {new Date(selectedProject.startDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })} ~ {new Date(selectedProject.endDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="text-[10px] text-muted-foreground mb-1">團隊</div>
                        <div className="font-medium text-xs">{selectedProject.team.length} 人</div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="text-[10px] text-muted-foreground mb-1">預算</div>
                        <div className="font-medium text-xs">{fmtMoney(selectedProject.budgetUsed)} / {fmtMoney(selectedProject.budget)}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="text-[10px] text-muted-foreground mb-1">週報更新</div>
                        <div className="font-medium text-xs">{selectedProject.weeklyUpdates.length} 次</div>
                      </div>
                    </div>

                    {selectedProject.risks.filter(r => r.status === 'open').length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">未解決風險</div>
                        {selectedProject.risks.filter(r => r.status === 'open').map(r => (
                          <div key={r.id} className="flex items-center gap-2 p-2 rounded border text-xs">
                            <AlertTriangle className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              r.impact === 'high' ? 'text-red-500' : r.impact === 'medium' ? 'text-amber-500' : 'text-slate-400',
                            )} />
                            <span className="truncate">{r.title}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0 ml-auto">
                              {r.impact === 'high' ? '高' : r.impact === 'medium' ? '中' : '低'}影響
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Single project: team workload bar chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" /> 團隊工作量
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {memberWorkload.map(m => (
                    <div key={m.name} className="flex items-center gap-3">
                      <span className="text-xs font-medium w-[72px] truncate shrink-0">{m.name}</span>
                      <div className="flex-1 h-5 rounded bg-muted overflow-hidden relative">
                        <div
                          className="h-full rounded bg-primary/80 transition-all"
                          style={{ width: `${(m.total / maxMemberTasks) * 100}%` }}
                        />
                        <div
                          className="h-full rounded bg-emerald-500 absolute top-0 left-0 transition-all"
                          style={{ width: `${(m.done / maxMemberTasks) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 w-[52px] text-right">{m.done}/{m.total}</span>
                    </div>
                  ))}
                  {memberWorkload.length > 0 && (
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
                      <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-emerald-500 inline-block" />已完成</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-primary/80 inline-block" />總任務</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
    </DashboardLayout>
  )
}
