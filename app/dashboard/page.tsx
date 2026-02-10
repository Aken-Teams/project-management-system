'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useProjectStore } from '@/lib/project-store'
import { PROJECT_TYPE_LABELS, type ProjectStatus } from '@/lib/mock-data'
import {
  TrendingUp,
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
} from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const { user } = useAuth()
  const { projects: allProjects, getPendingApprovals } = useProjectStore()
  const pendingApprovals = getPendingApprovals()

  const userProjects = user?.role === 'member'
    ? allProjects.filter(p => p.team.includes(user.name))
    : allProjects

  const stats = {
    total: userProjects.length,
    green: userProjects.filter(p => p.status === 'green').length,
    yellow: userProjects.filter(p => p.status === 'yellow').length,
    red: userProjects.filter(p => p.status === 'red').length,
    avgProgress: userProjects.length > 0 ? Math.round(userProjects.reduce((acc, p) => acc + p.progress, 0) / userProjects.length) : 0,
    totalBudget: userProjects.reduce((acc, p) => acc + p.budget, 0),
    totalBudgetUsed: userProjects.reduce((acc, p) => acc + p.budgetUsed, 0),
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

  const budgetUtilization = stats.totalBudget > 0 ? Math.round((stats.totalBudgetUsed / stats.totalBudget) * 100) : 0

  // 風險專案的開放風險
  const openRisks = userProjects
    .filter(p => p.status === 'red' || p.status === 'yellow')
    .flatMap(p =>
      p.risks
        .filter(r => r.status === 'open')
        .filter(r => user?.role !== 'executive' || r.impact === 'high')
        .map(risk => ({ ...risk, projectName: p.name }))
    )

  // 即將到期的里程碑（未完成 + 30 天內到期）
  const today = new Date()
  const upcomingMilestones = userProjects
    .flatMap(p =>
      p.milestones
        .filter(m => m.status !== 'done')
        .map(m => {
          const due = new Date(m.dueDate)
          const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          return { ...m, projectName: p.name, projectId: p.id, projectStatus: p.status, diffDays }
        })
    )
    .filter(m => m.diffDays <= 30)
    .sort((a, b) => a.diffDays - b.diffDays)

  // 本週尚未更新週報的專案
  const getMonday = (d: Date) => {
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().split('T')[0]
  }
  const thisMonday = getMonday(today)
  const missingUpdates = userProjects.filter(p => {
    const hasThisWeek = p.weeklyUpdates.some(u => u.weekOf === thisMonday)
    return !hasThisWeek
  })

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">儀表板</h1>
            <p className="text-sm text-muted-foreground mt-1">歡迎回來，{user?.name}</p>
          </div>
          {(user?.role === 'pm' || user?.role === 'executive') && pendingApprovals.length > 0 && (
            <Link href="/approvals">
              <Button size="sm" className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                <ClipboardCheck className="h-4 w-4" />
                {pendingApprovals.length} 筆待審核
              </Button>
            </Link>
          )}
        </div>

        {/* Stats Cards - Compact */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">{user?.role === 'member' ? '參與專案' : '總專案數'}</span>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-success" />{stats.green}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-warning" />{stats.yellow}</span>
              <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-destructive" />{stats.red}</span>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">平均進度</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.avgProgress}%</div>
            <Progress value={stats.avgProgress} className="mt-1.5 h-1.5" />
          </Card>

          {user?.role !== 'member' ? (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">預算使用率</span>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold">{budgetUtilization}%</div>
              <p className="text-xs text-muted-foreground mt-1">
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
                {userProjects.reduce((acc, p) => acc + p.tasks.filter(t => t.assignee === user?.name).length, 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {userProjects.reduce((acc, p) => acc + p.tasks.filter(t => t.assignee === user?.name && t.status === 'done').length, 0)} 已完成
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
            <div className="text-2xl font-bold text-success">{stats.green}<span className="text-base font-normal text-muted-foreground">/{stats.total}</span></div>
            <p className="text-xs text-muted-foreground mt-1">專案運行正常</p>
          </Card>
        </div>

        {/* Project List + Risk Summary */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Project List - Takes 2 columns */}
          <Card className="lg:col-span-2">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">
                {user?.role === 'member' ? '我的專案' : '專案總覽'}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="space-y-1.5">
                {userProjects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer">
                      <Badge
                        variant="secondary"
                        className={`${getStatusColor(project.status)} shrink-0 h-6 text-xs`}
                      >
                        <span className="flex items-center gap-1">
                          {getStatusIcon(project.status)}
                          {getStatusText(project.status)}
                        </span>
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{project.projectCode}</span>
                          <span className="font-medium text-sm truncate">{project.name}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 hidden sm:flex">
                        {PROJECT_TYPE_LABELS[project.projectType]}
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
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                風險摘要
              </CardTitle>
              {openRisks.length > 3 && (
                <span className="text-xs text-muted-foreground">共 {openRisks.length} 項</span>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {openRisks.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-1.5 text-success" />
                  <p className="text-sm">目前無風險</p>
                </div>
              ) : (
                <div className="max-h-[258px] overflow-y-auto space-y-2">
                  {openRisks.map((risk) => (
                    <div key={risk.id} className="p-2.5 rounded-md border text-sm space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{risk.projectName}</Badge>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${risk.impact === 'high' ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'}`}
                        >
                          {risk.impact === 'high' ? '高' : '中'}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium">{risk.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{risk.mitigation}</p>
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
                <span className="text-xs text-muted-foreground">共 {upcomingMilestones.length} 項</span>
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
                  {upcomingMilestones.map((m) => (
                    <Link key={m.id} href={`/projects/${m.projectId}`}>
                      <div className="flex items-center gap-3 px-2 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer">
                        <Badge
                          variant="outline"
                          className={`text-[11px] shrink-0 font-mono px-1.5 ${m.diffDays < 0 ? 'border-destructive/40 text-destructive' : m.diffDays <= 7 ? 'border-warning/40 text-warning' : ''}`}
                        >
                          {new Date(m.dueDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                        </Badge>
                        <span className="text-sm truncate flex-1 min-w-0">{m.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">{m.projectName}</span>
                        <Badge
                          variant="secondary"
                          className={`text-[11px] shrink-0 ${m.diffDays < 0 ? 'bg-destructive/10 text-destructive' : m.diffDays <= 7 ? 'bg-warning/10 text-warning' : 'bg-muted'}`}
                        >
                          {m.diffDays < 0 ? `逾期 ${Math.abs(m.diffDays)} 天` : m.diffDays === 0 ? '今天到期' : `剩 ${m.diffDays} 天`}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Missing Weekly Updates */}
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileX className="h-4 w-4 text-warning" />
                本週未更新
              </CardTitle>
              {missingUpdates.length > 3 && (
                <span className="text-xs text-muted-foreground">共 {missingUpdates.length} 項</span>
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
                  {missingUpdates.map((p) => {
                    const lastUpdate = p.weeklyUpdates.length > 0 ? p.weeklyUpdates[p.weeklyUpdates.length - 1].weekOf : null
                    return (
                      <Link key={p.id} href={`/projects/${p.id}`}>
                        <div className="flex items-center gap-3 px-2 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${p.status === 'red' ? 'bg-destructive' : p.status === 'yellow' ? 'bg-warning' : 'bg-success'}`} />
                          <span className="text-sm truncate flex-1 min-w-0">{p.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{p.owner}</span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
