'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { getAllProjects, type ProjectStatus } from '@/lib/mock-data'
import { 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  DollarSign,
  Users,
  FolderKanban
} from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const { user } = useAuth()
  const projects = getAllProjects()

  // 根據角色過濾專案
  const userProjects = user?.role === 'member' 
    ? projects.filter(p => p.team.includes(user.name))
    : projects

  const stats = {
    total: userProjects.length,
    green: userProjects.filter(p => p.status === 'green').length,
    yellow: userProjects.filter(p => p.status === 'yellow').length,
    red: userProjects.filter(p => p.status === 'red').length,
    avgProgress: Math.round(userProjects.reduce((acc, p) => acc + p.progress, 0) / userProjects.length),
    totalBudget: userProjects.reduce((acc, p) => acc + p.budget, 0),
    totalBudgetUsed: userProjects.reduce((acc, p) => acc + p.budgetUsed, 0),
  }

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'green':
        return 'bg-success text-success-foreground'
      case 'yellow':
        return 'bg-warning text-warning-foreground'
      case 'red':
        return 'bg-destructive text-destructive-foreground'
    }
  }

  const getStatusIcon = (status: ProjectStatus) => {
    switch (status) {
      case 'green':
        return <CheckCircle2 className="h-4 w-4" />
      case 'yellow':
        return <Clock className="h-4 w-4" />
      case 'red':
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const getStatusText = (status: ProjectStatus) => {
    switch (status) {
      case 'green':
        return '正常'
      case 'yellow':
        return '注意'
      case 'red':
        return '風險'
    }
  }

  const budgetUtilization = Math.round((stats.totalBudgetUsed / stats.totalBudget) * 100)

  const getRoleDescription = () => {
    switch (user?.role) {
      case 'pm':
        return '以下是您負責的所有專案概況與關鍵指標。'
      case 'executive':
        return '以下是所有專案的整體概況與戰略洞察。'
      case 'member':
        return `以下是您參與的 ${userProjects.length} 個專案。`
      default:
        return '以下是您的專案概況。'
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user?.role === 'executive' ? '戰略儀表板' : user?.role === 'pm' ? 'PM 工作台' : '我的工作台'}
          </h1>
          <p className="text-muted-foreground mt-1">
            歡迎回來，{user?.name}！{getRoleDescription()}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {user?.role === 'member' ? '參與專案' : '總專案數'}
              </CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.green} 正常 · {stats.yellow} 注意 · {stats.red} 風險
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">平均進度</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgProgress}%</div>
              <Progress value={stats.avgProgress} className="mt-2" />
            </CardContent>
          </Card>

          {/* 一般成員不顯示預算資訊 */}
          {user?.role !== 'member' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">預算使用率</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{budgetUtilization}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  ${(stats.totalBudgetUsed / 1000000).toFixed(1)}M / ${(stats.totalBudget / 1000000).toFixed(1)}M
                </p>
              </CardContent>
            </Card>
          )}
          
          {/* 一般成員顯示任務統計 */}
          {user?.role === 'member' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">我的任務</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {userProjects.reduce((acc, p) => acc + p.tasks.filter(t => t.assignee === user.name).length, 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {userProjects.reduce((acc, p) => acc + p.tasks.filter(t => t.assignee === user.name && t.status === 'done').length, 0)} 已完成
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">健康度</CardTitle>
              {stats.green > stats.red ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{stats.green}</div>
              <p className="text-xs text-muted-foreground mt-1">
                專案運行正常
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Projects Overview */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Active Projects */}
          <Card>
            <CardHeader>
              <CardTitle>
                {user?.role === 'member' ? '我的專案' : '進行中的專案'}
              </CardTitle>
              <CardDescription>
                {user?.role === 'executive' 
                  ? '戰略級專案概覽' 
                  : user?.role === 'member' 
                    ? '您參與的專案' 
                    : '最近更新的專案列表'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {userProjects.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{project.name}</h4>
                        <Badge 
                          variant="secondary" 
                          className={`${getStatusColor(project.status)} shrink-0`}
                        >
                          <span className="flex items-center gap-1">
                            {getStatusIcon(project.status)}
                            {getStatusText(project.status)}
                          </span>
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {project.team.length} 人
                        </span>
                        <span>進度 {project.progress}%</span>
                      </div>
                      <Progress value={project.progress} className="mt-2 h-1.5" />
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* Risk Alert */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                {user?.role === 'executive' ? '戰略風險' : '風險警報'}
              </CardTitle>
              <CardDescription>
                {user?.role === 'executive' 
                  ? '高優先級風險摘要' 
                  : user?.role === 'member' 
                    ? '您參與專案的風險' 
                    : '需要關注的專案與風險'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {userProjects
                .filter(p => p.status === 'red' || p.status === 'yellow')
                .flatMap(p => 
                  p.risks
                    .filter(r => r.status === 'open')
                    // 主管只看高影響風險
                    .filter(r => user?.role !== 'executive' || r.impact === 'high')
                    .map(risk => ({ ...risk, projectName: p.name, projectStatus: p.status }))
                )
                .slice(0, 5)
                .map((risk) => (
                  <div key={risk.id} className="p-3 rounded-lg border bg-card space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {risk.projectName}
                          </Badge>
                          <Badge 
                            variant="secondary"
                            className={risk.impact === 'high' ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'}
                          >
                            {risk.impact === 'high' ? '高' : risk.impact === 'medium' ? '中' : '低'}影響
                          </Badge>
                        </div>
                        <h5 className="font-medium text-sm">{risk.title}</h5>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {risk.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs bg-muted p-2 rounded">
                      <span className="font-medium">緩解措施：</span> {risk.mitigation}
                    </div>
                  </div>
                ))}
              
              {userProjects.filter(p => p.status === 'red' || p.status === 'yellow').length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-success" />
                  <p>
                    {user?.role === 'member' 
                      ? '您參與的專案目前沒有風險' 
                      : '目前沒有需要關注的風險'
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
