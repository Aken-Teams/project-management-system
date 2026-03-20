'use client'

import React, { useState, useEffect } from 'react'
import { use } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { MilestoneTaskView } from '@/components/milestone-task-view'
import { ProjectRiskTab } from '@/components/project-risk-tab'
import { ProjectDelayTab } from '@/components/project-delay-tab'
import { WeeklyActivitySummary } from '@/components/weekly-activity-summary'
import { RoiSection, type RoiParams } from '@/components/roi-section'
import { PROJECT_TYPE_LABELS, TEAM_ROLE_LABELS, type ProjectStatus, type Project, type TeamRole } from '@/lib/mock-data'
import {
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
  Loader2,
  Link2Off,
} from 'lucide-react'

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [roiParams, setRoiParams] = useState<RoiParams | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? '分享連結無效' : res.status === 410 ? '分享連結已過期' : '讀取失敗')
        return res.json()
      })
      .then(data => {
        setProject(data)
        if (data?.roiGrossMargin != null || data?.roiAvgPrice != null || data?.roiCapacity != null) {
          setRoiParams({
            grossMargin: data.roiGrossMargin ?? null,
            avgPrice: data.roiAvgPrice ?? null,
            capacity: data.roiCapacity ?? null,
          })
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <Link2Off className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">無法存取</h2>
            <p className="text-muted-foreground">{error || '找不到此分享連結'}</p>
          </CardContent>
        </Card>
      </div>
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

  const budgetUtilization = project.budget > 0 ? Math.round((project.budgetUsed / project.budget) * 100) : 0
  const completedMilestones = project.milestones.filter(m => m.status === 'done').length
  const pendingDelays = project.delayRequests.filter(r => r.status === 'pending')
  const daysLeft = Math.max(0, Math.ceil((new Date(project.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  const openRisks = project.risks.filter(r => r.status === 'open')

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-xs">唯讀</Badge>
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
              {project.objective && (
                <p className="text-muted-foreground mt-1">{project.objective}</p>
              )}
            </div>
          </div>

          {/* Pending delay alert */}
          {pendingDelays.length > 0 && (
            <div className="mt-3 p-3 rounded-lg border border-warning/50 bg-warning/10 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <span className="text-sm font-medium text-warning">有 {pendingDelays.length} 筆延遲申請待主管審核</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Stats Bar */}
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

          {project.budget > 0 && (
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

        {/* Tabs */}
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
            <div className="grid gap-4 lg:grid-cols-5 items-start">
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
                    {project.expectedBenefits && (
                      <div className="py-3">
                        <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                          <TrendingUp className="h-3 w-3" />
                          預期效益
                        </div>
                        <p className="text-sm">{project.expectedBenefits}</p>
                      </div>
                    )}
                    <div className="py-3 last:pb-0">
                      <RoiSection
                        projectId={project.id}
                        budget={project.budget ?? 0}
                        roiText={project.roi ?? ''}
                        roiParams={roiParams}
                        budgetItems={[]}
                        onSaved={() => {}}
                        readOnly
                      />
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
                      {(project.teamMembers ?? project.team.map(n => ({ id: n, name: n, role: 'R' as const, responsibility: '', jobTitle: '' }))).slice().sort((a, b) => (a.role === 'A' ? -1 : b.role === 'A' ? 1 : 0)).map(member => {
                        const roleLabel = TEAM_ROLE_LABELS[member.role as TeamRole] || member.role
                        const isAccountable = member.role === 'A'
                        return (
                          <Badge key={member.id ?? member.name} variant={isAccountable ? 'default' : 'secondary'} className="text-sm">
                            {member.name}
                            {member.jobTitle && <span className={`ml-1 ${isAccountable ? 'opacity-70' : 'text-muted-foreground'}`}>({member.jobTitle})</span>}
                            <span className={`ml-1 ${isAccountable ? 'opacity-70' : 'text-muted-foreground'}`}>{roleLabel}</span>
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Work Items Tab */}
          <TabsContent value="work-items" className="mt-0">
            <MilestoneTaskView
              project={project}
              readOnly
            />
          </TabsContent>

          {/* Updates Tab */}
          <TabsContent value="updates" className="mt-0">
            <WeeklyActivitySummary project={project} />
          </TabsContent>

          {/* Risks Tab */}
          <TabsContent value="risks" className="mt-0">
            <ProjectRiskTab project={project} readOnly />
          </TabsContent>

          {/* Delays Tab */}
          <TabsContent value="delays" className="mt-0">
            <ProjectDelayTab project={project} readOnly />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground py-4 border-t">
          此為唯讀分享頁面
        </div>
      </div>
    </div>
  )
}
