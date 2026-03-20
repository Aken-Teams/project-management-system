'use client'

import React, { useState, useEffect } from "react"
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { MilestoneTaskView } from '@/components/milestone-task-view'
import { useAuth } from '@/lib/auth-context'
import { useNotificationStore } from '@/lib/notification-store'
import { PROJECT_TYPE_LABELS, TEAM_ROLE_LABELS, type ProjectStatus, type Project, type TeamRole } from '@/lib/mock-data'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Loader2,
  Pencil,
  Trash2,
  Share2,
  Copy,
  Check,
} from 'lucide-react'
import Link from 'next/link'
import { ProjectEditDialog, type ProjectEditData } from '@/components/project-edit-dialog'
import { ProjectDeleteDialog } from '@/components/project-delete-dialog'
import { ProjectRiskTab } from '@/components/project-risk-tab'
import { ProjectDelayTab } from '@/components/project-delay-tab'
import { WeeklyActivitySummary } from '@/components/weekly-activity-summary'
import { RoiSection, type RoiParams } from '@/components/roi-section'

// --- Main page ---

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { refreshNotifications } = useNotificationStore()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [budgetItems, setBudgetItems] = useState<{ id?: string; station: string; vendor: string; equipment: string; quantity: number; unitPrice: number | null; estimatedCost: number | null; actualCost: number | null }[]>([])
  const [roiParams, setRoiParams] = useState<RoiParams | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/projects/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setProject(data)
          setLoading(false)
          refreshNotifications() // pick up any overdue notification just created server-side
          if (data?.roiGrossMargin != null || data?.roiAvgPrice != null || data?.roiCapacity != null) {
            setRoiParams({
              grossMargin: data.roiGrossMargin ?? null,
              avgPrice: data.roiAvgPrice ?? null,
              capacity: data.roiCapacity ?? null,
            })
          }
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    fetch(`/api/projects/${id}/budget-items`)
      .then(r => r.ok ? r.json() : [])
      .then(setBudgetItems)
      .catch(() => {})
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

  const handleShare = async () => {
    if (!user || !project) return
    setShareLoading(true)
    try {
      const res = await fetch(`/api/projects/${id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      if (res.ok) {
        const { token } = await res.json()
        setShareToken(token)
        setShareDialogOpen(true)
      }
    } finally {
      setShareLoading(false)
    }
  }

  const copyShareLink = () => {
    if (!shareToken) return
    const url = `${window.location.origin}/share/${shareToken}`
    navigator.clipboard.writeText(url)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
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

  const actualTotal = budgetItems.reduce((s, i) => s + (i.actualCost ?? 0), 0)
  const estimatedTotal = budgetItems.reduce((s, i) => s + (i.estimatedCost ?? 0), 0)
  const budgetDenom = estimatedTotal > 0 ? estimatedTotal : project.budget
  const budgetUtilization = budgetDenom > 0 ? Math.round((actualTotal / budgetDenom) * 100) : 0
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
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare} disabled={shareLoading}>
                {shareLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                分享
              </Button>
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
                ${(actualTotal / 1000000).toFixed(1)}M / ${(budgetDenom / 1000000).toFixed(1)}M
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
                        projectId={id}
                        budget={project.budget ?? 0}
                        roiText={project.roi ?? ''}
                        roiParams={roiParams}
                        budgetItems={budgetItems}
                        onSaved={(newItems, newParams) => {
                          setBudgetItems(newItems as typeof budgetItems)
                          setRoiParams(newParams)
                        }}
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

          {/* Work Items Tab (Milestones + Tasks unified view) */}
          <TabsContent value="work-items" className="mt-0">
            <MilestoneTaskView
              project={project}
              onTaskUpdate={async () => {
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
            <ProjectDelayTab project={project} onRefresh={() => {
              fetch(`/api/projects/${id}`).then(r => r.ok ? r.json() : null).then(d => d && setProject(d))
            }} />
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
          onSaved={async () => {
            const res = await fetch(`/api/projects/${id}/budget-items`)
            if (res.ok) setBudgetItems(await res.json())
          }}
        />
      )}
      <ProjectDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        project={project}
        onConfirm={handleDeleteProject}
      />

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              分享專案
            </DialogTitle>
            <DialogDescription>
              任何擁有此連結的人都可以檢視專案（唯讀）
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={shareToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${shareToken}` : ''}
              className="text-sm"
            />
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={copyShareLink}>
              {shareCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {shareCopied ? '已複製' : '複製'}
            </Button>
          </div>
          <DialogFooter className="sm:justify-start">
            <p className="text-xs text-muted-foreground">連結不會過期，可隨時分享給需要查看進度的人</p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
