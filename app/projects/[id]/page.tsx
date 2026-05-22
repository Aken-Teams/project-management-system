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
import { TEAM_ROLE_LABELS, type ProjectStatus, type Project, type TeamRole } from '@/lib/mock-data'
import { useProjectTypes } from '@/hooks/use-project-types'
import { Input } from '@/components/ui/input'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format, addDays } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'
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
  ShoppingCart,
} from 'lucide-react'
import Link from 'next/link'
import { ProjectEditDialog, type ProjectEditData } from '@/components/project-edit-dialog'
import { ProjectDeleteDialog } from '@/components/project-delete-dialog'
import { ProjectRiskTab } from '@/components/project-risk-tab'
import { ProjectDelayTab } from '@/components/project-delay-tab'
import { WeeklyActivitySummary } from '@/components/weekly-activity-summary'
import { RoiSection, type RoiParams } from '@/components/roi-section'
import { CapexTable, type CapexItemData } from '@/components/capex-table'

// --- Main page ---

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { typeLabels } = useProjectTypes()
  const { refreshNotifications } = useNotificationStore()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [budgetItems, setBudgetItems] = useState<{ id?: string; station: string; vendor: string; equipment: string; quantity: number; unitPrice: number | null; estimatedCost: number | null; actualCost: number | null }[]>([])
  const [roiParams, setRoiParams] = useState<RoiParams | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [roleHelpOpen, setRoleHelpOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareExpiresAt, setShareExpiresAt] = useState<Date>(addDays(new Date(), 7))
  const [shareExpiryDays, setShareExpiryDays] = useState<number>(7)
  const [shareLinks, setShareLinks] = useState<Array<{
    id: string; token: string; createdAt: string; expiresAt: string | null
    createdBy: { name: string }
  }>>([])
  const [shareLinksLoading, setShareLinksLoading] = useState(false)
  const [shareCopiedId, setShareCopiedId] = useState<string | null>(null)
  const [capexItems, setCapexItems] = useState<CapexItemData[]>([])

  // Team role of current user in this project
  const currentUserTeamRole = project?.teamMembers?.find(
    m => m.email === user?.email
  )?.role
  const canViewCapex = currentUserTeamRole === 'A' || currentUserTeamRole === 'P' || user?.role === 'pm' || user?.role === 'executive' || user?.role === 'admin'
  const canEditCapex = currentUserTeamRole === 'P'
  const canEditRoi = user?.role === 'pm' || user?.role === 'admin'

  const fetchShareLinks = async () => {
    setShareLinksLoading(true)
    try {
      const res = await fetch(`/api/projects/${id}/share`)
      if (res.ok) setShareLinks(await res.json())
    } finally { setShareLinksLoading(false) }
  }

  const deleteShareLink = async (linkId: string) => {
    await fetch(`/api/projects/${id}/share`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId }),
    })
    fetchShareLinks()
  }

  const copyLink = (token: string, linkId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/share/${token}`)
    setShareCopiedId(linkId)
    setTimeout(() => setShareCopiedId(null), 2000)
  }

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

  useEffect(() => {
    if (!canViewCapex) return
    fetch(`/api/projects/${id}/capex`)
      .then(r => r.ok ? r.json() : [])
      .then(setCapexItems)
      .catch(() => {})
  }, [id, canViewCapex]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (updated?.roiGrossMargin != null || updated?.roiAvgPrice != null || updated?.roiCapacity != null) {
      setRoiParams({
        grossMargin: updated.roiGrossMargin ?? null,
        avgPrice: updated.roiAvgPrice ?? null,
        capacity: updated.roiCapacity ?? null,
      })
    }
  }

  const handleDeleteProject = async () => {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || '刪除失敗')
    }
    router.push('/projects')
  }

  const [shareError, setShareError] = useState<string | null>(null)

  const handleShare = async () => {
    if (!user || !project) return
    setShareLoading(true)
    setShareError(null)
    try {
      const res = await fetch(`/api/projects/${id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, expiresAt: shareExpiresAt.toISOString() }),
      })
      if (res.ok) {
        const { token } = await res.json()
        setShareToken(token)
        fetchShareLinks()
      } else {
        const data = await res.json().catch(() => ({}))
        setShareError(data.error || '建立失敗')
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
                  {typeLabels[project.projectType] || project.projectType}
                </Badge>
                <Badge variant="secondary" className={getStatusColor(project.status)}>
                  <span className="flex items-center gap-1">
                    {getStatusIcon(project.status)}
                    {getStatusText(project.status)}
                  </span>
                </Badge>
              </div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                {project.name}
                <button onClick={() => setRoleHelpOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <HelpCircle className="h-5 w-5" />
                </button>
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="default" className="gap-1.5" onClick={() => { setShareToken(null); setShareError(null); setShareExpiryDays(7); setShareExpiresAt(addDays(new Date(), 7)); setShareDialogOpen(true); fetchShareLinks() }}>
                {shareLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                分享
              </Button>
              {(currentUserTeamRole === 'A' || user?.role === 'pm' || user?.role === 'admin') && (
                <Button size="default" className="gap-1.5" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  編輯
                </Button>
              )}
              {(user?.role === 'pm' || user?.role === 'admin') && (
                <Button variant="destructive" size="default" className="gap-1.5" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                  刪除
                </Button>
              )}
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
              {canViewCapex && (
                <TabsTrigger value="capex" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5">
                  <ShoppingCart className="h-4 w-4" />
                  投資報酬
                  {capexItems.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-sm">
                      {capexItems.length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
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
                      <div className="text-sm font-semibold text-primary mb-1 flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3" />
                        開案原因
                      </div>
                      <p className={`text-sm whitespace-pre-line ${!project.createdReason ? 'text-muted-foreground italic' : ''}`}>{project.createdReason || '暫無'}</p>
                    </div>
                    <div className="py-3">
                      <div className="text-sm font-semibold text-primary mb-1 flex items-center gap-1.5">
                        <Target className="h-3 w-3" />
                        專案目的
                      </div>
                      <p className={`text-sm whitespace-pre-line ${!project.purpose ? 'text-muted-foreground italic' : ''}`}>{project.purpose || '暫無'}</p>
                    </div>
                    <div className="py-3">
                      <div className="text-sm font-semibold text-primary mb-1 flex items-center gap-1.5">
                        <LayoutList className="h-3 w-3" />
                        專案範圍
                      </div>
                      <p className={`text-sm whitespace-pre-line ${!project.scope ? 'text-muted-foreground italic' : ''}`}>{project.scope || '暫無'}</p>
                    </div>
                    <div className="py-3">
                      <div className="text-sm font-semibold text-primary mb-1 flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3" />
                        預期效益
                      </div>
                      <p className={`text-sm whitespace-pre-line ${!project.expectedBenefits ? 'text-muted-foreground italic' : ''}`}>{project.expectedBenefits || '暫無'}</p>
                    </div>
                    {project.smartObjective && (
                      <div className="py-3">
                        <div className="text-sm font-semibold text-primary mb-2 flex items-center gap-1.5">
                          <Target className="h-3 w-3" />
                          SMART 目標
                        </div>
                        <div className="grid gap-0 divide-y">
                          {([
                            { key: 'specific', label: 'S — 具體目標' },
                            { key: 'measurable', label: 'M — 可衡量指標' },
                            { key: 'achievable', label: 'A — 可達成性' },
                            { key: 'relevant', label: 'R — 相關性' },
                            { key: 'timeBound', label: 'T — 時限性' },
                          ] as const)
                            .map(item => {
                              const val = (project.smartObjective as Record<string, string>)?.[item.key]
                              return (
                                <div key={item.key} className="py-2 first:pt-0 last:pb-0">
                                  <span className="text-xs font-semibold text-primary/80">{item.label}</span>
                                  <p className={`text-sm mt-0.5 whitespace-pre-line ${!val ? 'text-muted-foreground italic' : ''}`}>{val || '暫無'}</p>
                                </div>
                              )
                            })
                          }
                        </div>
                      </div>
                    )}
                    <div className="py-3 last:pb-0">
                      <RoiSection
                        budget={project.budget ?? 0}
                        roiParams={roiParams}
                        budgetItems={budgetItems}
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
                        const roleColorMap: Record<string, string> = {
                          S: 'bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-300',
                          A: 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300',
                          P: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300',
                          R: 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300',
                          C: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-100 dark:bg-cyan-900 dark:text-cyan-300',
                          I: 'bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300',
                        }
                        const colorClass = roleColorMap[member.role] || ''
                        return (
                          <Badge key={member.id ?? member.name} variant="outline" className={`text-sm border-transparent ${colorClass}`}>
                            {member.name}
                            {member.jobTitle && <span className="ml-1 opacity-70">({member.jobTitle})</span>}
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
              onTaskUpdate={async () => {
                const res = await fetch(`/api/projects/${id}`)
                if (res.ok) setProject(await res.json())
              }}
              readOnly={currentUserTeamRole !== 'A' && user?.role !== 'pm' && user?.role !== 'admin'}
            />
          </TabsContent>

          {/* Updates Tab — Auto-generated weekly summaries */}
          <TabsContent value="updates" className="mt-0">
            <WeeklyActivitySummary project={project} />
          </TabsContent>

          {/* Risks Tab — Static risks from project creation */}
          <TabsContent value="risks" className="mt-0">
            <ProjectRiskTab project={project} onRefresh={() => {
              fetch(`/api/projects/${id}`).then(r => r.ok ? r.json() : null).then(d => d && setProject(d))
            }} />
          </TabsContent>

          {/* Delays Tab */}
          <TabsContent value="delays" className="mt-0">
            <ProjectDelayTab project={project} onRefresh={() => {
              fetch(`/api/projects/${id}`).then(r => r.ok ? r.json() : null).then(d => d && setProject(d))
            }} />
          </TabsContent>

          {/* CAPEX / Investment ROI Tab */}
          {canViewCapex && (
            <TabsContent value="capex" className="mt-0">
              <CapexTable
                projectId={id}
                items={capexItems}
                budgetItems={budgetItems}
                roiParams={roiParams}
                budget={project?.budget ?? 0}
                readOnly={!canEditCapex}
                canEditRoi={canEditRoi}
                onSaved={setCapexItems}
                onRoiParamsSaved={setRoiParams}
              />
            </TabsContent>
          )}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              分享專案
            </DialogTitle>
            <DialogDescription>
              任何擁有此連結的人都可以檢視專案（唯讀）
            </DialogDescription>
          </DialogHeader>

          {/* New link creation */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-2">建立新連結</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '7 天', days: 7 },
                  { label: '14 天', days: 14 },
                  { label: '30 天', days: 30 },
                  { label: '90 天', days: 90 },
                ].map(preset => (
                  <Button
                    key={preset.days}
                    variant={shareExpiryDays === preset.days ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => { setShareExpiryDays(preset.days); setShareExpiresAt(addDays(new Date(), preset.days)) }}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={shareExpiryDays === 0 ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs h-8 gap-1.5"
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      自訂
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarUI
                      mode="single"
                      selected={shareExpiresAt}
                      onSelect={(d) => { if (d) { setShareExpiresAt(d); setShareExpiryDays(0) } }}
                      disabled={(date) => date <= new Date()}
                      locale={zhTW}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">
                  到期日：{format(shareExpiresAt, 'yyyy/MM/dd (EEEE)', { locale: zhTW })}
                </p>
                <Button size="sm" className="gap-1.5 h-8" onClick={handleShare} disabled={shareLoading}>
                  {shareLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                  產生連結
                </Button>
              </div>
              {shareError && (
                <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {shareError}
                </p>
              )}
            </div>
          </div>

          {/* Newly created link */}
          {shareToken && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <p className="text-xs font-medium text-primary">新連結已建立</p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${shareToken}`}
                  className="text-xs h-8"
                />
                <Button size="sm" variant="outline" className="shrink-0 gap-1 h-8 text-xs" onClick={copyShareLink}>
                  {shareCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {shareCopied ? '已複製' : '複製'}
                </Button>
              </div>
            </div>
          )}

          {/* Link history */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">連結紀錄</p>
              <p className="text-xs text-muted-foreground">
                有效 {shareLinks.filter(l => !l.expiresAt || new Date(l.expiresAt) > new Date()).length} / 5
              </p>
            </div>
            {shareLinksLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : shareLinks.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">尚無分享連結</p>
            ) : (
              <div className="max-h-[156px] overflow-y-auto space-y-0 divide-y rounded-lg border">
                {shareLinks.map(link => {
                  const expired = link.expiresAt ? new Date(link.expiresAt) < new Date() : false
                  const expSoon = !expired && link.expiresAt
                    ? (new Date(link.expiresAt).getTime() - Date.now()) < 3 * 24 * 60 * 60 * 1000
                    : false
                  return (
                    <div key={link.id} className={`flex items-center gap-2 px-3 py-2 text-xs ${expired ? 'opacity-50' : ''}`}>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono truncate text-muted-foreground">...{link.token.slice(-8)}</span>
                          {expired ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">已過期</Badge>
                          ) : expSoon ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-warning border-warning/30">即將到期</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-600/30">有效</Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground">
                          {link.createdBy.name} 建立於 {format(new Date(link.createdAt), 'MM/dd')}
                          {link.expiresAt && <> · 到期 {format(new Date(link.expiresAt), 'yyyy/MM/dd')}</>}
                          {!link.expiresAt && <> · 永不過期</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!expired && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyLink(link.token, link.id)}>
                            {shareCopiedId === link.id ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteShareLink(link.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Role Help Dialog */}
      <Dialog open={roleHelpOpen} onOpenChange={setRoleHelpOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-3">
            <DialogTitle className="text-xl">專案詳細 — 角色權限說明</DialogTitle>
            <DialogDescription>說明專案角色（SAPRCI）與系統角色在專案詳細頁的權限</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Current user role */}
            {currentUserTeamRole && (
              <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-800 p-3 flex items-center gap-2">
                <Badge className="bg-blue-100 hover:bg-blue-100 text-blue-700 dark:bg-blue-900 dark:hover:bg-blue-900 dark:text-blue-300 border-transparent text-xs">您的專案角色</Badge>
                <span className="text-sm font-medium">{TEAM_ROLE_LABELS[currentUserTeamRole as TeamRole] || currentUserTeamRole}（{currentUserTeamRole}）</span>
              </div>
            )}

            {/* SAPRCI Table */}
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" /> 專案角色（SAPRCI）
              </h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">角色</th>
                      <th className="text-center px-3 py-2 font-medium">編輯專案</th>
                      <th className="text-center px-3 py-2 font-medium">甘特圖週報</th>
                      <th className="text-center px-3 py-2 font-medium">投資報酬</th>
                      <th className="text-center px-3 py-2 font-medium">審核延期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { code: 'S', name: '簽核', edit: false, gantt: '唯讀', roi: '—', review: true },
                      { code: 'A', name: '當責', edit: true, gantt: '可寫', roi: '可見', review: false },
                      { code: 'P', name: '採購', edit: false, gantt: '唯讀', roi: '可編輯', review: false },
                      { code: 'R', name: '執行', edit: false, gantt: '唯讀', roi: '—', review: false },
                      { code: 'C', name: '諮詢', edit: false, gantt: '唯讀', roi: '—', review: false },
                      { code: 'I', name: '知會', edit: false, gantt: '唯讀', roi: '—', review: false },
                    ].map((r, i) => (
                      <tr key={r.code} className={`${i % 2 !== 0 ? 'bg-muted/20' : ''} ${currentUserTeamRole === r.code ? 'bg-blue-50/80 dark:bg-blue-950/20' : ''}`}>
                        <td className="px-3 py-2">
                          <span className="font-medium">{r.code}</span>
                          <span className="text-muted-foreground ml-1.5">{r.name}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.edit ? <span className="text-emerald-600 font-medium">✓</span> : <span className="text-muted-foreground">✗</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.gantt === '可寫' ? <span className="text-emerald-600 font-medium">✓ 可寫</span> : <span className="text-muted-foreground">唯讀</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.roi === '可編輯' ? <span className="text-amber-600 font-medium">✓ 可編輯</span> : r.roi === '可見' ? <span className="text-blue-600 font-medium">可見</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.review ? <span className="text-violet-600 font-medium">✓</span> : <span className="text-muted-foreground">✗</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* System Roles Table */}
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-indigo-500" /> 系統角色（額外權限）
              </h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">系統角色</th>
                      <th className="text-center px-3 py-2 font-medium">編輯專案</th>
                      <th className="text-center px-3 py-2 font-medium">刪除專案</th>
                      <th className="text-center px-3 py-2 font-medium">甘特圖週報</th>
                      <th className="text-center px-3 py-2 font-medium">投資報酬</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: '專案經理', edit: true, del: true, gantt: true, roi: true },
                      { name: '主管', edit: false, del: false, gantt: false, roi: true },
                      { name: '管理員', edit: true, del: true, gantt: true, roi: true },
                      { name: '一般成員', edit: false, del: false, gantt: false, roi: false },
                    ].map((r, i) => (
                      <tr key={r.name} className={i % 2 !== 0 ? 'bg-muted/20' : ''}>
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        {[r.edit, r.del, r.gantt, r.roi].map((v, j) => (
                          <td key={j} className="px-3 py-2 text-center">
                            {v ? <span className="text-emerald-600 font-medium">✓</span> : <span className="text-muted-foreground">✗</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">※ 系統角色權限可<span className="text-blue-600 dark:text-blue-400 font-medium">疊加</span>專案角色權限。例如系統角色為 PM 且專案角色為 A，則同時擁有兩者權限。</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
