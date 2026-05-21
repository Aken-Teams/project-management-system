'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { PROJECT_TIER_LABELS, type ProjectStatus, type ProjectTier } from '@/lib/mock-data'
import { useProjectTypes } from '@/hooks/use-project-types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import {
  TrendingUp,
  HelpCircle,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  FolderKanban,
  ClipboardCheck,
  AlertTriangle,
  CalendarClock,
  FileX,
  ArrowRight,
  Loader2,
  CalendarDays,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

interface DashboardData {
  user: {
    id: string
    name: string
    role: string
  }
  stats: {
    total: number
    green: number
    yellow: number
    red: number
    tierCounts: { T1: number; T2: number; T3: number; CIP: number }
    totalBudget: number
    totalBudgetUsed: number
    budgetUtilization: number
  }
  projects: Array<{
    id: string
    projectCode: string
    name: string
    projectType: string
    projectTier: ProjectTier
    status: ProjectStatus
    progress: number
    owner: string
  }>
  openRisks: Array<{
    id: string
    projectId: string
    projectName: string
    title: string
    description: string
    impact: string
    probability: string
    mitigation: string
  }>
  upcomingMilestones: Array<{
    id: string
    projectId: string
    projectName: string
    projectStatus: ProjectStatus
    name: string
    dueDate: string
    diffDays: number
  }>
  missingUpdates: Array<{
    id: string
    name: string
    status: ProjectStatus
    owner: string
    lastUpdateWeekOf: string | null
  }>
  pendingApprovals: number
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { typeLabels } = useProjectTypes()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tierFilter, setTierFilter] = useState<ProjectTier | null>(null)
  const currentYear = new Date().getFullYear()
  const [dateFrom, setDateFrom] = useState<Date>(new Date(currentYear, 0, 1))
  const [dateTo, setDateTo] = useState<Date>(new Date(currentYear, 11, 31))

  useEffect(() => {
    if (!user) return

    const fetchDashboard = async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        if (user.id) params.append('userId', user.id)
        else if (user.email) params.append('userEmail', user.email)
        if (tierFilter) params.append('tier', tierFilter)
        params.append('from', dateFrom.toISOString().split('T')[0])
        params.append('to', dateTo.toISOString().split('T')[0])

        const response = await fetch(`/api/dashboard?${params}`)
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data')
        }

        const dashboardData: DashboardData = await response.json()
        setData(dashboardData)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch dashboard:', err)
        setError('載入儀表板失敗')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [user, tierFilter, dateFrom, dateTo])

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'green': return 'bg-success text-success-foreground hover:bg-success'
      case 'yellow': return 'bg-warning text-warning-foreground hover:bg-warning'
      case 'red': return 'bg-destructive text-destructive-foreground hover:bg-destructive'
    }
  }

  const getStatusIcon = (status: ProjectStatus) => {
    switch (status) {
      case 'green': return <CheckCircle2 className="h-3.5 w-3.5" />
      case 'yellow': return <Clock className="h-3.5 w-3.5" />
      case 'red': return <AlertCircle className="h-3.5 w-3.5" />
    }
  }

  const getStatusText = (status: ProjectStatus) => {
    switch (status) {
      case 'green': return '正常'
      case 'yellow': return '注意'
      case 'red': return '風險'
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-semibold">{error || '載入失敗'}</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const { stats, projects, openRisks, upcomingMilestones, missingUpdates, pendingApprovals } = data

  const defaultFrom = new Date(currentYear, 0, 1)
  const defaultTo = new Date(currentYear, 11, 31)
  const isDefaultFilter = tierFilter === null
    && dateFrom.getTime() === defaultFrom.getTime()
    && dateTo.getTime() === defaultTo.getTime()

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">儀表板</h1>
            <p className="text-sm text-muted-foreground mt-1">歡迎回來，{data.user.name}</p>
          </div>
          <div className="flex items-center gap-2 bg-card rounded-lg border px-3 py-2">
            {/* Date range filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-normal">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  {format(dateFrom, 'yyyy/MM/dd')} - {format(dateTo, 'yyyy/MM/dd')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="end">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <HelpCircle className="h-3 w-3 shrink-0" />
                    依專案起迄日期篩選，期間有重疊即顯示
                  </p>
                  <div className="flex items-center gap-2">
                    {[
                      { label: '今年', from: new Date(currentYear, 0, 1), to: new Date(currentYear, 11, 31) },
                      { label: '去年', from: new Date(currentYear - 1, 0, 1), to: new Date(currentYear - 1, 11, 31) },
                      { label: '近 3 個月', from: new Date(new Date().setMonth(new Date().getMonth() - 3)), to: new Date() },
                      { label: '近 6 個月', from: new Date(new Date().setMonth(new Date().getMonth() - 6)), to: new Date() },
                    ].map(preset => (
                      <Button
                        key={preset.label}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => { setDateFrom(preset.from); setDateTo(preset.to) }}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium px-1">開始日期</p>
                      <CalendarUI
                        mode="single"
                        selected={dateFrom}
                        onSelect={(d) => { if (!d) return; setDateFrom(d); if (d > dateTo) setDateTo(d) }}
                        locale={zhTW}
                        initialFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium px-1">結束日期</p>
                      <CalendarUI
                        mode="single"
                        selected={dateTo}
                        onSelect={(d) => d && setDateTo(d)}
                        disabled={(date) => date < dateFrom}
                        locale={zhTW}
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {/* Tier filter */}
            <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5">
              {[{ value: null as ProjectTier | null, label: '全部' }, ...Object.keys(PROJECT_TIER_LABELS).map(t => ({ value: t as ProjectTier | null, label: PROJECT_TIER_LABELS[t as ProjectTier] }))].map(item => (
                <button
                  key={item.label}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    tierFilter === item.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground/70 hover:text-foreground hover:bg-muted'
                  }`}
                  onClick={() => setTierFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {!isDefaultFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1 text-muted-foreground"
                onClick={() => { setTierFilter(null); setDateFrom(defaultFrom); setDateTo(defaultTo) }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重設
              </Button>
            )}
            {(data.user.role === 'pm' || data.user.role === 'executive') && pendingApprovals > 0 && (
              <Link href="/approvals">
                <Button size="sm" className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  <ClipboardCheck className="h-4 w-4" />
                  {pendingApprovals} 筆待審核
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Stats Cards - Compact */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">{data.user.role === 'member' ? '參與專案' : '總專案數'}</span>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-success" />{stats.green}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-warning" />{stats.yellow}</span>
              <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-destructive" />{stats.red}</span>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">專案層級</span>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex justify-between">
              {([
                { tier: 'T1', color: 'text-blue-600' },
                { tier: 'T2', color: 'text-emerald-600' },
                { tier: 'T3', color: 'text-amber-600' },
                { tier: 'CIP', color: 'text-purple-600' },
              ] as const).map(({ tier, color }, i) => (
                <div key={tier} className={`flex-1 text-center ${i < 3 ? 'border-r' : ''}`}>
                  <div className={`text-xl font-bold ${color}`}>{stats.tierCounts[tier]}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{tier}</div>
                </div>
              ))}
            </div>
          </Card>

          {data.user.role !== 'member' ? (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">預算使用率</span>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold">{stats.budgetUtilization}%</div>
              <p className="text-sm text-muted-foreground mt-1">
                ${(stats.totalBudgetUsed / 1000000).toFixed(1)}M / ${(stats.totalBudget / 1000000).toFixed(1)}M
              </p>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">我的任務</span>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold">
                0
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                0 已完成
              </p>
            </Card>
          )}

          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">健康度</span>
              {stats.green >= stats.red ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </div>
            <div className={`text-2xl font-bold ${stats.red > 0 ? 'text-destructive' : stats.yellow > 0 ? 'text-warning' : 'text-success'}`}>
              {stats.green}<span className="text-base font-normal text-muted-foreground">/{stats.total}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {stats.red > 0
                ? `${stats.red} 個專案有風險`
                : stats.yellow > 0
                  ? `${stats.yellow} 個專案需注意`
                  : '專案運行正常'}
            </p>
          </Card>
        </div>

        {/* Project List + Risk Summary */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Project List - Takes 2 columns */}
          <Card className="lg:col-span-2 flex flex-col max-h-[360px]">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between shrink-0">
              <CardTitle className="text-base">
                {data.user.role === 'member' ? '我的專案' : '專案總覽'}
              </CardTitle>
              <span className="text-sm text-muted-foreground">共 {projects.length} 筆</span>
            </CardHeader>
            <CardContent className="px-4 pb-3 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-1.5">
                {projects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer">
                      <Badge
                        variant="secondary"
                        className={`${getStatusColor(project.status)} shrink-0 h-6 text-sm`}
                      >
                        <span className="flex items-center gap-1">
                          {getStatusIcon(project.status)}
                          {getStatusText(project.status)}
                        </span>
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-muted-foreground">{project.projectCode}</span>
                          <span className="font-medium text-sm truncate">{project.name}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-sm shrink-0 hidden sm:flex">
                        {typeLabels[project.projectType] || project.projectType}
                      </Badge>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-20 hidden md:block">
                          <Progress value={project.progress} className="h-1.5" />
                        </div>
                        <span className="text-sm font-medium w-10 text-right">{project.progress}%</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Risk Summary - Takes 1 column */}
          <Card className="flex flex-col max-h-[360px]">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                風險摘要
              </CardTitle>
              {openRisks.length > 3 && (
                <span className="text-sm text-muted-foreground">共 {openRisks.length} 項</span>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-3 overflow-y-auto flex-1 min-h-0">
              {openRisks.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-1.5 text-success" />
                  <p className="text-sm">目前無風險</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {openRisks.map((risk) => (
                    <div key={risk.id} className="p-2.5 rounded-md border text-sm space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-sm">{risk.projectName}</Badge>
                        <Badge
                          variant="secondary"
                          className={`text-sm ${risk.impact === 'high' ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'}`}
                        >
                          {risk.impact === 'high' ? '高' : '中'}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium">{risk.title}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{risk.mitigation}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row: Upcoming Milestones + Missing Weekly Updates */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Upcoming Milestones */}
          <Card className="lg:col-span-2">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                即將到期的里程碑
              </CardTitle>
              {upcomingMilestones.length > 3 && (
                <span className="text-sm text-muted-foreground">共 {upcomingMilestones.length} 項</span>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {upcomingMilestones.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-1.5 text-success" />
                  <p className="text-sm">近期無到期里程碑</p>
                </div>
              ) : (
                <div className="max-h-[126px] overflow-y-auto divide-y divide-border/50">
                  {upcomingMilestones.map((m) => {
                    const dueDate = new Date(m.dueDate)
                    return (
                      <Link key={m.id} href={`/projects/${m.projectId}`}>
                        <div className="flex items-center gap-3 px-2 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer">
                          <Badge
                            variant="outline"
                            className={`text-[11px] shrink-0 font-mono px-1.5 ${m.diffDays < 0 ? 'border-destructive/40 text-destructive' : m.diffDays <= 7 ? 'border-warning/40 text-warning' : ''}`}
                          >
                            {dueDate.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                          </Badge>
                          <span className="text-sm truncate flex-1 min-w-0">{m.name}</span>
                          <span className="text-sm text-muted-foreground shrink-0 hidden sm:block">{m.projectName}</span>
                          <Badge
                            variant="secondary"
                            className={`text-[11px] shrink-0 ${m.diffDays < 0 ? 'bg-destructive/10 text-destructive' : m.diffDays <= 7 ? 'bg-warning/10 text-warning' : 'bg-muted'}`}
                          >
                            {m.diffDays < 0 ? `逾期 ${Math.abs(m.diffDays)} 天` : m.diffDays === 0 ? '今天到期' : `剩 ${m.diffDays} 天`}
                          </Badge>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Missing Weekly Updates */}
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileX className="h-4 w-4 text-warning" />
                本週末更新
              </CardTitle>
              {missingUpdates.length > 3 && (
                <span className="text-sm text-muted-foreground">共 {missingUpdates.length} 項</span>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {missingUpdates.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-1.5 text-success" />
                  <p className="text-sm">所有專案皆已更新</p>
                </div>
              ) : (
                <div className="max-h-[126px] overflow-y-auto divide-y divide-border/50">
                  {missingUpdates.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`}>
                      <div className="flex items-center gap-3 px-2 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${p.status === 'red' ? 'bg-destructive' : p.status === 'yellow' ? 'bg-warning' : 'bg-success'}`} />
                        <span className="text-sm truncate flex-1 min-w-0">{p.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{p.owner}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
