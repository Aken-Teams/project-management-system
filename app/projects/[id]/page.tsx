'use client'

import React from "react"
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KanbanBoard } from '@/components/kanban-board'
import { useProjectStore } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { PROJECT_TYPE_LABELS, type ProjectStatus } from '@/lib/mock-data'
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
  ClipboardEdit,
  History,
  GitCompareArrows,
  Tag
} from 'lucide-react'
import Link from 'next/link'

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { getProject } = useProjectStore()
  const { user } = useAuth()
  const project = getProject(id)

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
  const canUpdate = user?.role === 'pm' || project.owner === user?.name || project.team.includes(user?.name || '')
  const pendingDelays = project.delayRequests.filter(r => r.status === 'pending')

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="gap-2 mb-4">
              <ArrowLeft className="h-4 w-4" />
              返回專案列表
            </Button>
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-mono text-muted-foreground">{project.projectCode}</span>
                <Badge variant="outline">
                  <Tag className="h-3 w-3 mr-1" />
                  {PROJECT_TYPE_LABELS[project.projectType]}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
                <Badge
                  variant="secondary"
                  className={getStatusColor(project.status)}
                >
                  <span className="flex items-center gap-1">
                    {getStatusIcon(project.status)}
                    {getStatusText(project.status)}
                  </span>
                </Badge>
              </div>
              <p className="text-muted-foreground">{project.objective}</p>
            </div>
            <div className="flex gap-2">
              {canUpdate && (
                <Link href={`/projects/${project.id}/update`}>
                  <Button className="gap-2">
                    <ClipboardEdit className="h-4 w-4" />
                    更新進度
                  </Button>
                </Link>
              )}
              <Link href={`/gantt?project=${project.id}`}>
                <Button variant="outline">甘特圖</Button>
              </Link>
              <Link href={`/reports?project=${project.id}`}>
                <Button variant="outline" className="gap-2 bg-transparent">
                  <FileText className="h-4 w-4" />
                  報告
                </Button>
              </Link>
            </div>
          </div>

          {/* Pending delay alert */}
          {pendingDelays.length > 0 && (
            <div className="mt-4 p-4 rounded-lg border border-warning/50 bg-warning/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <span className="font-medium text-warning">有 {pendingDelays.length} 筆延遲申請待主管審核</span>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                專案進度
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{project.progress}%</div>
              <Progress value={project.progress} className="h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                時程
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {new Date(project.startDate).toLocaleDateString('zh-TW')} - {new Date(project.endDate).toLocaleDateString('zh-TW')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                剩餘 {Math.max(0, Math.ceil((new Date(project.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} 天
              </p>
            </CardContent>
          </Card>

          {user?.role !== 'member' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  預算
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">{budgetUtilization}%</div>
                <p className="text-xs text-muted-foreground">
                  ${(project.budgetUsed / 1000000).toFixed(1)}M / ${(project.budget / 1000000).toFixed(1)}M
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                團隊
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{project.team.length}</div>
              <p className="text-xs text-muted-foreground">
                負責人：{project.owner}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">概覽</TabsTrigger>
            <TabsTrigger value="kanban">看板</TabsTrigger>
            <TabsTrigger value="milestones">里程碑</TabsTrigger>
            <TabsTrigger value="updates">
              更新紀錄
              {project.weeklyUpdates.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                  {project.weeklyUpdates.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="risks">風險</TabsTrigger>
            <TabsTrigger value="delays">
              延遲紀錄
              {pendingDelays.length > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">
                  {pendingDelays.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>專案資訊</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">開案原因</div>
                    <p className="mt-1">{project.createdReason}</p>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">專案目的</div>
                    <p className="mt-1">{project.purpose}</p>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">專案範圍</div>
                    <p className="mt-1">{project.scope}</p>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">投資報酬 (ROI)</div>
                    <p className="mt-1">{project.roi}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    進度摘要
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">已完成里程碑</span>
                    <span className="font-medium">{completedMilestones} / {project.milestones.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">任務總數</span>
                    <span className="font-medium">{project.tasks.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">已完成任務</span>
                    <span className="font-medium">
                      {project.tasks.filter(t => t.status === 'done').length} / {project.tasks.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">未解決風險</span>
                    <span className="font-medium text-destructive">
                      {project.risks.filter(r => r.status === 'open').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">最近更新</span>
                    <span className="font-medium">
                      {project.weeklyUpdates.length > 0
                        ? new Date(project.weeklyUpdates[0].updatedAt).toLocaleDateString('zh-TW')
                        : '尚無更新'
                      }
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Kanban Tab */}
          <TabsContent value="kanban">
            <KanbanBoard tasks={project.tasks} projectId={project.id} />
          </TabsContent>

          {/* Milestones Tab - with Baseline comparison */}
          <TabsContent value="milestones">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompareArrows className="h-5 w-5" />
                  里程碑 vs Baseline
                </CardTitle>
                <CardDescription>
                  {completedMilestones} / {project.milestones.length} 已完成 · 與原始基線比較
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.milestones.map((milestone, index) => {
                  const baselineMs = project.baseline.find(b => b.id === milestone.id)
                  const isDelayed = baselineMs && milestone.dueDate > baselineMs.dueDate
                  const delayDays = baselineMs
                    ? Math.ceil((new Date(milestone.dueDate).getTime() - new Date(baselineMs.dueDate).getTime()) / (1000 * 60 * 60 * 24))
                    : 0

                  return (
                    <div key={milestone.id} className={`flex items-start gap-4 p-4 rounded-lg border ${isDelayed ? 'border-warning/50 bg-warning/5' : ''}`}>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h4 className="font-medium">{milestone.name}</h4>
                          <div className="flex items-center gap-2">
                            {isDelayed && (
                              <Badge variant="secondary" className="bg-warning text-warning-foreground text-xs">
                                延遲 {delayDays} 天
                              </Badge>
                            )}
                            <Badge variant={milestone.status === 'done' ? 'default' : milestone.status === 'blocked' ? 'destructive' : 'secondary'}>
                              {milestone.status === 'done' ? '已完成' : milestone.status === 'in-progress' ? '進行中' : milestone.status === 'blocked' ? '受阻' : '待辦'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            目前：{new Date(milestone.dueDate).toLocaleDateString('zh-TW')}
                          </span>
                          {baselineMs && (
                            <span className={`flex items-center gap-1 ${isDelayed ? 'text-warning' : ''}`}>
                              基線：{new Date(baselineMs.dueDate).toLocaleDateString('zh-TW')}
                            </span>
                          )}
                          <span>進度 {milestone.progress}%</span>
                        </div>
                        <Progress value={milestone.progress} className="h-1.5" />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Updates Tab */}
          <TabsContent value="updates">
            <div className="space-y-4">
              {canUpdate && (
                <div className="flex justify-end">
                  <Link href={`/projects/${project.id}/update`}>
                    <Button className="gap-2">
                      <ClipboardEdit className="h-4 w-4" />
                      填寫本週更新
                    </Button>
                  </Link>
                </div>
              )}

              {project.weeklyUpdates.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <History className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">尚無更新紀錄</p>
                    {canUpdate && (
                      <p className="text-sm text-muted-foreground mt-1">點擊上方按鈕開始填寫本週進度</p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                project.weeklyUpdates.map((update) => (
                  <Card key={update.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <History className="h-4 w-4" />
                          第 {update.weekOf} 週更新
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant={update.overallStatus === 'on-time' ? 'default' : 'destructive'}>
                            {update.overallStatus === 'on-time' ? '準時' : '延遲'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {update.updatedBy} · {new Date(update.updatedAt).toLocaleDateString('zh-TW')}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Milestone updates */}
                      {update.milestoneUpdates.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-2">里程碑更新</div>
                          <div className="space-y-2">
                            {update.milestoneUpdates.map((mu) => {
                              const ms = project.milestones.find(m => m.id === mu.milestoneId)
                              return (
                                <div key={mu.milestoneId} className="flex items-center gap-3 p-2 rounded bg-muted/50 text-sm">
                                  <span className="font-medium min-w-[120px]">{ms?.name || mu.milestoneId}</span>
                                  <Progress value={mu.progress} className="h-1.5 flex-1" />
                                  <span className="text-muted-foreground w-10 text-right">{mu.progress}%</span>
                                  {mu.notes && <span className="text-muted-foreground">— {mu.notes}</span>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid gap-3 md:grid-cols-2">
                        {update.keyAchievements && (
                          <div className="p-3 rounded-lg border bg-success/5">
                            <div className="text-xs font-medium text-success mb-1 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              本週成果
                            </div>
                            <p className="text-sm">{update.keyAchievements}</p>
                          </div>
                        )}
                        {update.nextWeekPlan && (
                          <div className="p-3 rounded-lg border">
                            <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              下週計畫
                            </div>
                            <p className="text-sm">{update.nextWeekPlan}</p>
                          </div>
                        )}
                      </div>

                      {update.blockers && update.blockers !== '無' && (
                        <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                          <div className="text-xs font-medium text-destructive mb-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            阻礙
                          </div>
                          <p className="text-sm">{update.blockers}</p>
                        </div>
                      )}

                      {update.overallNotes && (
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">備註：</span>{update.overallNotes}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Risks Tab */}
          <TabsContent value="risks">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  風險管理
                </CardTitle>
                <CardDescription>
                  {project.risks.filter(r => r.status === 'open').length} 個未解決風險
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.risks.map((risk) => (
                  <div key={risk.id} className="p-4 rounded-lg border space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium">{risk.title}</h4>
                          <Badge variant={risk.status === 'open' ? 'destructive' : risk.status === 'mitigated' ? 'secondary' : 'default'}>
                            {risk.status === 'open' ? '未解決' : risk.status === 'mitigated' ? '已緩解' : '已關閉'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{risk.description}</p>
                        <div className="flex gap-2">
                          <Badge
                            variant="secondary"
                            className={risk.impact === 'high' ? 'bg-destructive text-destructive-foreground' : risk.impact === 'medium' ? 'bg-warning text-warning-foreground' : ''}
                          >
                            {risk.impact === 'high' ? '高' : risk.impact === 'medium' ? '中' : '低'}影響
                          </Badge>
                          <Badge variant="outline">
                            {risk.probability === 'high' ? '高' : risk.probability === 'medium' ? '中' : '低'}機率
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="bg-muted p-3 rounded text-sm">
                      <span className="font-medium">緩解措施：</span> {risk.mitigation}
                    </div>
                  </div>
                ))}

                {project.risks.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-success" />
                    <p>目前沒有識別到的風險</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Delays Tab */}
          <TabsContent value="delays">
            <div className="space-y-4">
              {project.delayRequests.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-success" />
                    <p className="text-muted-foreground">沒有延遲紀錄</p>
                  </CardContent>
                </Card>
              ) : (
                project.delayRequests.map((request) => (
                  <Card key={request.id} className={request.status === 'pending' ? 'border-warning/50' : ''}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">延遲申請</CardTitle>
                        <Badge variant={
                          request.status === 'pending' ? 'secondary'
                          : request.status === 'approved' ? 'default'
                          : 'destructive'
                        } className={request.status === 'pending' ? 'bg-warning text-warning-foreground' : ''}>
                          {request.status === 'pending' ? '待審核' : request.status === 'approved' ? '已核准' : '已駁回'}
                        </Badge>
                      </div>
                      <CardDescription>
                        {request.requestedBy} · {new Date(request.requestedAt).toLocaleDateString('zh-TW')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="text-sm font-medium mb-1">延遲原因</div>
                        <p className="text-sm text-muted-foreground">{request.reason}</p>
                      </div>

                      <div>
                        <div className="text-sm font-medium mb-2">受影響里程碑</div>
                        <div className="space-y-2">
                          {request.affectedMilestones.map((am) => {
                            const ms = project.milestones.find(m => m.id === am.milestoneId)
                            const days = Math.ceil(
                              (new Date(am.proposedDate).getTime() - new Date(am.originalDate).getTime()) / (1000 * 60 * 60 * 24)
                            )
                            return (
                              <div key={am.milestoneId} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                                <span className="font-medium">{ms?.name || am.milestoneId}</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-muted-foreground line-through">
                                    {new Date(am.originalDate).toLocaleDateString('zh-TW')}
                                  </span>
                                  <span>→</span>
                                  <span className="text-warning font-medium">
                                    {new Date(am.proposedDate).toLocaleDateString('zh-TW')}
                                  </span>
                                  <Badge variant="outline" className="text-xs">+{days}天</Badge>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {request.supportNeeded && (
                        <div>
                          <div className="text-sm font-medium mb-1">需要的支援</div>
                          <p className="text-sm text-muted-foreground">{request.supportNeeded}</p>
                        </div>
                      )}

                      {request.reviewedBy && (
                        <div className="p-3 rounded-lg border bg-muted/50">
                          <div className="text-xs text-muted-foreground mb-1">
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
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
