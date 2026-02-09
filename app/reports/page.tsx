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
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'email' | null>(null)
  const [emailSent, setEmailSent] = useState(false)

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
  const handleExport = (format: 'pdf' | 'email') => {
    setExportFormat(format)
    setShowExportModal(true)
    setEmailSent(false)
  }

  const handleConfirmExport = () => {
    if (exportFormat === 'email') {
      setEmailSent(true)
      setTimeout(() => { setShowExportModal(false); setEmailSent(false) }, 2000)
    } else {
      setTimeout(() => setShowExportModal(false), 1500)
    }
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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">專案報告</h1>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-[220px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有專案（總覽）</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleExport('email')}>
                <Mail className="h-3.5 w-3.5" /> Email
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => handleExport('pdf')}>
                <FileDown className="h-3.5 w-3.5" /> 匯出 PDF
              </Button>
            </div>
          </div>

          {/* Export Modal */}
          {showExportModal && (
            <Card className="border-primary/50">
              <CardContent className="pt-5 pb-4">
                {emailSent ? (
                  <div className="text-center py-4">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-success" />
                    <p className="font-medium text-success">報告已發送！</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm">
                      <span className="font-medium">{exportFormat === 'pdf' ? '匯出 PDF' : 'Email 發送'}</span>
                      <span className="text-muted-foreground ml-2">
                        {selectedProject ? selectedProject.name : '所有專案'} — {new Date().toLocaleDateString('zh-TW')}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleConfirmExport} className="gap-1.5">
                        {exportFormat === 'pdf' ? <><Printer className="h-3.5 w-3.5" /> 下載</> : <><Mail className="h-3.5 w-3.5" /> 發送</>}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowExportModal(false)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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

          {/* Donut Charts — 2-col, larger */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Task Status Donut */}
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">任務狀態分佈</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center gap-8 py-6">
                <DonutChart segments={taskSegments} size={180} strokeWidth={28}>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{stats.totalTasks}</div>
                    <div className="text-xs text-muted-foreground">總任務</div>
                  </div>
                </DonutChart>
                <div className="space-y-3">
                  {taskSegments.filter(s => s.value > 0).map(seg => {
                    const pct = stats.totalTasks > 0 ? Math.round((seg.value / stats.totalTasks) * 100) : 0
                    return (
                      <div key={seg.label} className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                        <div className="min-w-[52px]">
                          <div className="text-sm font-semibold">{seg.value}</div>
                          <div className="text-[10px] text-muted-foreground">{seg.label}</div>
                        </div>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    )
                  })}
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
              <CardContent className="flex items-center justify-center gap-8 py-6">
                {selectedProject ? (
                  <>
                    <DonutChart
                      segments={[
                        { value: selectedProject.milestones.filter(m => m.status === 'done').length, color: '#10b981', label: '完成' },
                        { value: selectedProject.milestones.filter(m => m.status === 'in-progress').length, color: '#3b82f6', label: '進行中' },
                        { value: selectedProject.milestones.filter(m => m.status === 'todo').length, color: '#94a3b8', label: '待辦' },
                        { value: selectedProject.milestones.filter(m => m.status === 'blocked').length, color: '#ef4444', label: '受阻' },
                      ]}
                      size={180} strokeWidth={28}
                    >
                      <div className="text-center">
                        <div className="text-2xl font-bold">{selectedProject.progress}%</div>
                        <div className="text-xs text-muted-foreground">進度</div>
                      </div>
                    </DonutChart>
                    <div className="space-y-2">
                      {selectedProject.milestones.map(m => (
                        <div key={m.id} className="flex items-center gap-2">
                          <span className={cn(
                            'h-2.5 w-2.5 rounded-full shrink-0',
                            m.status === 'done' ? 'bg-emerald-500' :
                            m.status === 'in-progress' ? 'bg-blue-500' :
                            m.status === 'blocked' ? 'bg-red-500' : 'bg-slate-400',
                          )} />
                          <span className="text-xs truncate max-w-[140px]">{m.name}</span>
                          <span className="text-xs font-semibold ml-auto">{m.progress}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <DonutChart segments={statusSegments} size={180} strokeWidth={28}>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{projects.length}</div>
                        <div className="text-xs text-muted-foreground">專案</div>
                      </div>
                    </DonutChart>
                    <div className="space-y-3">
                      {statusSegments.filter(s => s.value > 0).map(seg => {
                        const pct = projects.length > 0 ? Math.round((seg.value / projects.length) * 100) : 0
                        return (
                          <div key={seg.label} className="flex items-center gap-3">
                            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                            <div className="min-w-[52px]">
                              <div className="text-sm font-semibold">{seg.value}</div>
                              <div className="text-[10px] text-muted-foreground">{seg.label}</div>
                            </div>
                            <span className="text-xs text-muted-foreground">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
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
