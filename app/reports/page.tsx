'use client'

import { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  Target,
  Calendar,
  BarChart3,
  Mail,
  FileDown,
  Printer,
  X
} from 'lucide-react'

export default function ReportsPage() {
  const { projects } = useProjectStore()
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'email' | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const selectedProject = selectedProjectId === 'all'
    ? null
    : projects.find(p => p.id === selectedProjectId)

  // Calculate statistics
  const stats = selectedProject ? {
    progress: selectedProject.progress,
    budgetUsed: selectedProject.budgetUsed,
    budget: selectedProject.budget,
    teamSize: selectedProject.team.length,
    completedMilestones: selectedProject.milestones.filter(m => m.status === 'done').length,
    totalMilestones: selectedProject.milestones.length,
    completedTasks: selectedProject.tasks.filter(t => t.status === 'done').length,
    totalTasks: selectedProject.tasks.length,
    openRisks: selectedProject.risks.filter(r => r.status === 'open').length,
    status: selectedProject.status,
    weeklyUpdates: selectedProject.weeklyUpdates.length,
    delayRequests: selectedProject.delayRequests.length,
    pendingDelays: selectedProject.delayRequests.filter(r => r.status === 'pending').length,
  } : {
    progress: projects.length > 0 ? Math.round(projects.reduce((acc, p) => acc + p.progress, 0) / projects.length) : 0,
    budgetUsed: projects.reduce((acc, p) => acc + p.budgetUsed, 0),
    budget: projects.reduce((acc, p) => acc + p.budget, 0),
    teamSize: new Set(projects.flatMap(p => p.team)).size,
    completedMilestones: projects.reduce((acc, p) => acc + p.milestones.filter(m => m.status === 'done').length, 0),
    totalMilestones: projects.reduce((acc, p) => acc + p.milestones.length, 0),
    completedTasks: projects.reduce((acc, p) => acc + p.tasks.filter(t => t.status === 'done').length, 0),
    totalTasks: projects.reduce((acc, p) => acc + p.tasks.length, 0),
    openRisks: projects.reduce((acc, p) => acc + p.risks.filter(r => r.status === 'open').length, 0),
    status: null as ProjectStatus | null,
    weeklyUpdates: projects.reduce((acc, p) => acc + p.weeklyUpdates.length, 0),
    delayRequests: projects.reduce((acc, p) => acc + p.delayRequests.length, 0),
    pendingDelays: projects.reduce((acc, p) => acc + p.delayRequests.filter(r => r.status === 'pending').length, 0),
  }

  const budgetUtilization = stats.budget > 0 ? Math.round((stats.budgetUsed / stats.budget) * 100) : 0
  const milestoneCompletion = stats.totalMilestones > 0 ? Math.round((stats.completedMilestones / stats.totalMilestones) * 100) : 0
  const taskCompletion = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0

  const getHealthStatus = () => {
    if (selectedProject) {
      const status = selectedProject.status
      if (status === 'green') return { text: '健康', icon: CheckCircle2, color: 'text-success' }
      if (status === 'yellow') return { text: '需注意', icon: Clock, color: 'text-warning' }
      return { text: '高風險', icon: AlertTriangle, color: 'text-destructive' }
    }
    const greenCount = projects.filter(p => p.status === 'green').length
    const totalCount = projects.length
    const pct = totalCount > 0 ? (greenCount / totalCount) * 100 : 100
    if (pct >= 70) return { text: '整體健康', icon: CheckCircle2, color: 'text-success' }
    if (pct >= 40) return { text: '需關注', icon: Clock, color: 'text-warning' }
    return { text: '需改善', icon: AlertTriangle, color: 'text-destructive' }
  }

  const healthStatus = getHealthStatus()
  const HealthIcon = healthStatus.icon

  const handleExport = (format: 'pdf' | 'email') => {
    setExportFormat(format)
    setShowExportModal(true)
    setEmailSent(false)
  }

  const handleConfirmExport = () => {
    if (exportFormat === 'email') {
      setEmailSent(true)
      setTimeout(() => {
        setShowExportModal(false)
        setEmailSent(false)
      }, 2000)
    } else {
      // Simulate PDF download
      setTimeout(() => {
        setShowExportModal(false)
      }, 1500)
    }
  }

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'green': return 'bg-success text-success-foreground'
      case 'yellow': return 'bg-warning text-warning-foreground'
      case 'red': return 'bg-destructive text-destructive-foreground'
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">專案報告</h1>
            <p className="text-muted-foreground mt-1">
              專案執行狀況與關鍵指標分析
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => handleExport('email')}>
              <Mail className="h-4 w-4" />
              Email 發送
            </Button>
            <Button className="gap-2" onClick={() => handleExport('pdf')}>
              <FileDown className="h-4 w-4" />
              匯出 PDF
            </Button>
          </div>
        </div>

        {/* Export Modal */}
        {showExportModal && (
          <Card className="border-primary/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium flex items-center gap-2">
                  {exportFormat === 'pdf' ? (
                    <><FileDown className="h-5 w-5 text-primary" /> 匯出 PDF 報告</>
                  ) : (
                    <><Mail className="h-5 w-5 text-primary" /> Email 發送報告</>
                  )}
                </h3>
                <Button variant="ghost" size="icon" onClick={() => setShowExportModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {emailSent ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-success" />
                  <p className="font-medium text-success">報告已發送！</p>
                  <p className="text-sm text-muted-foreground mt-1">已寄送至所有專案相關人員（示範模式）</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <div className="text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">報告範圍</span>
                        <span className="font-medium">{selectedProject ? selectedProject.name : '所有專案（總覽）'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">報告日期</span>
                        <span className="font-medium">{new Date().toLocaleDateString('zh-TW')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">包含內容</span>
                        <span className="font-medium">進度、預算、里程碑、風險、更新紀錄</span>
                      </div>
                      {exportFormat === 'email' && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">收件人</span>
                          <span className="font-medium">所有專案相關人員</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">格式</span>
                        <span className="font-medium">{exportFormat === 'pdf' ? 'PDF 文件' : 'HTML Email + PDF 附件'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button onClick={handleConfirmExport} className="flex-1 gap-2">
                      {exportFormat === 'pdf' ? (
                        <><Printer className="h-4 w-4" /> 產生並下載 PDF</>
                      ) : (
                        <><Mail className="h-4 w-4" /> 發送報告</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => setShowExportModal(false)}>取消</Button>
                  </div>

                  <p className="text-xs text-muted-foreground text-center">
                    （示範模式：實際不會產生檔案或發送郵件）
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">選擇專案：</span>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="選擇專案" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有專案（總覽）</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.projectCode} — {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Health Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HealthIcon className={`h-6 w-6 ${healthStatus.color}`} />
              專案健康度
            </CardTitle>
            <CardDescription>
              {selectedProject ? `${selectedProject.name} 的健康狀況` : '所有專案的整體健康狀況'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className={`text-4xl font-bold ${healthStatus.color}`}>
                {healthStatus.text}
              </div>
              {stats.status && (
                <Badge
                  variant="secondary"
                  className={getStatusColor(stats.status)}
                >
                  {stats.status === 'green' ? '正常運行' : stats.status === 'yellow' ? '需要關注' : '高風險狀態'}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                專案進度
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{stats.progress}%</span>
                  {stats.progress >= 60 ? (
                    <TrendingUp className="h-4 w-4 text-success" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-warning" />
                  )}
                </div>
                <Progress value={stats.progress} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                預算執行
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{budgetUtilization}%</span>
                  {budgetUtilization <= 100 ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <Progress value={Math.min(budgetUtilization, 100)} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  ${(stats.budgetUsed / 1000000).toFixed(1)}M / ${(stats.budget / 1000000).toFixed(1)}M
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                里程碑完成
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{milestoneCompletion}%</span>
                </div>
                <Progress value={milestoneCompletion} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {stats.completedMilestones} / {stats.totalMilestones} 已完成
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                風險管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${stats.openRisks > 0 ? 'text-destructive' : 'text-success'}`}>
                    {stats.openRisks}
                  </span>
                  {stats.openRisks === 0 && <CheckCircle2 className="h-4 w-4 text-success" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.openRisks === 0 ? '無未解決風險' : '個未解決風險'}
                </p>
                {stats.pendingDelays > 0 && (
                  <p className="text-xs text-warning">{stats.pendingDelays} 筆延遲申請待審核</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Statistics */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>執行摘要</CardTitle>
              <CardDescription>
                {selectedProject ? selectedProject.name : '所有專案'} 的執行狀況
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-sm text-muted-foreground">任務完成率</span>
                  <span className="font-medium">{taskCompletion}% ({stats.completedTasks}/{stats.totalTasks})</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-sm text-muted-foreground">里程碑達成率</span>
                  <span className="font-medium">{milestoneCompletion}% ({stats.completedMilestones}/{stats.totalMilestones})</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-sm text-muted-foreground">預算執行率</span>
                  <span className={`font-medium ${budgetUtilization > 100 ? 'text-destructive' : ''}`}>
                    {budgetUtilization}%
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-sm text-muted-foreground">團隊規模</span>
                  <span className="font-medium flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {stats.teamSize} 人
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-sm text-muted-foreground">累計週更新次數</span>
                  <span className="font-medium">{stats.weeklyUpdates} 次</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-sm text-muted-foreground">延遲申請</span>
                  <span className="font-medium">
                    {stats.delayRequests} 次
                    {stats.pendingDelays > 0 && (
                      <Badge variant="destructive" className="ml-2 text-xs">{stats.pendingDelays} 待審</Badge>
                    )}
                  </span>
                </div>
              </div>

              {selectedProject && (
                <div className="mt-4 pt-4 border-t space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">專案期間：</span>
                    <span className="font-medium">
                      {new Date(selectedProject.startDate).toLocaleDateString('zh-TW')} - {new Date(selectedProject.endDate).toLocaleDateString('zh-TW')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">負責人：</span>
                    <span className="font-medium">{selectedProject.owner}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>關鍵發現</CardTitle>
              <CardDescription>需要關注的重點項目</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.progress >= 80 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm text-success">進度良好</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        專案進度達到 {stats.progress}%，執行狀況優異
                      </p>
                    </div>
                  </div>
                )}

                {budgetUtilization > 90 && budgetUtilization <= 100 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
                    <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm text-warning">預算即將用盡</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        預算使用率達 {budgetUtilization}%，建議關注剩餘預算
                      </p>
                    </div>
                  </div>
                )}

                {budgetUtilization > 100 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm text-destructive">預算超支</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        預算使用率 {budgetUtilization}%，超出原定預算
                      </p>
                    </div>
                  </div>
                )}

                {stats.openRisks > 0 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm text-destructive">風險警報</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        有 {stats.openRisks} 個未解決的風險需要關注
                      </p>
                    </div>
                  </div>
                )}

                {stats.pendingDelays > 0 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
                    <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm text-warning">延遲申請待審</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        有 {stats.pendingDelays} 筆延遲申請等待主管審核
                      </p>
                    </div>
                  </div>
                )}

                {milestoneCompletion >= 75 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm text-success">里程碑達成良好</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {stats.completedMilestones} / {stats.totalMilestones} 個里程碑已完成
                      </p>
                    </div>
                  </div>
                )}

                {stats.progress < 50 && stats.openRisks === 0 && budgetUtilization < 90 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-muted border">
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">專案運行穩定</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        目前沒有重大問題，專案按計劃進行中
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Project List (if all projects selected) */}
        {!selectedProject && (
          <Card>
            <CardHeader>
              <CardTitle>專案列表</CardTitle>
              <CardDescription>所有專案的狀態概覽</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {projects.map((project) => (
                  <div key={project.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">{project.projectCode}</span>
                        <h4 className="font-medium">{project.name}</h4>
                        <Badge
                          variant="secondary"
                          className={getStatusColor(project.status)}
                        >
                          {project.status === 'green' ? '正常' : project.status === 'yellow' ? '注意' : '風險'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {PROJECT_TYPE_LABELS[project.projectType]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>進度 {project.progress}%</span>
                        <span>預算 {project.budget > 0 ? Math.round((project.budgetUsed / project.budget) * 100) : 0}%</span>
                        <span>{project.team.length} 人</span>
                        <span>{project.weeklyUpdates.length} 次更新</span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      檢視報告
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
