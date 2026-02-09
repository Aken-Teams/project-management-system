'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { getAllProjects, type ProjectStatus } from '@/lib/mock-data'
import { 
  Search,
  Users,
  Calendar,
  DollarSign,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'

export default function ProjectsPage() {
  const { user } = useAuth()
  const allProjects = getAllProjects()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')

  // 根據角色過濾專案
  const projects = user?.role === 'member'
    ? allProjects.filter(p => p.team.includes(user.name) || p.owner === user.name)
    : allProjects

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.objective.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter
    return matchesSearch && matchesStatus
  })

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {user?.role === 'member' ? '我的專案' : '專案看板'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {user?.role === 'member' 
                ? '您參與的專案列表' 
                : user?.role === 'executive'
                  ? '所有專案的整體概覽與追蹤'
                  : '管理和追蹤所有專案的進度與狀態'
              }
            </p>
          </div>
          {/* 只有 PM 可以建立新專案 */}
          {user?.role === 'pm' && (
            <Link href="/projects/new">
              <Button size="lg">建立新專案</Button>
            </Link>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜尋專案名稱或目標..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <div className="flex gap-2">
                  <Button
                    variant={statusFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('all')}
                  >
                    全部
                  </Button>
                  <Button
                    variant={statusFilter === 'green' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('green')}
                    className={statusFilter === 'green' ? 'bg-success hover:bg-success/90' : ''}
                  >
                    正常
                  </Button>
                  <Button
                    variant={statusFilter === 'yellow' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('yellow')}
                    className={statusFilter === 'yellow' ? 'bg-warning hover:bg-warning/90' : ''}
                  >
                    注意
                  </Button>
                  <Button
                    variant={statusFilter === 'red' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('red')}
                    className={statusFilter === 'red' ? 'bg-destructive hover:bg-destructive/90' : ''}
                  >
                    風險
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <CardTitle className="text-lg line-clamp-2">{project.name}</CardTitle>
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
                  <CardDescription className="line-clamp-2">
                    {project.objective}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">專案進度</span>
                      <span className="font-medium">{project.progress}%</span>
                    </div>
                    <Progress value={project.progress} className="h-2" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{project.team.length} 人</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{new Date(project.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
                    </div>
                    {/* 一般成員不顯示預算 */}
                    {user?.role !== 'member' && (
                      <div className="flex items-center gap-2 col-span-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span>NT$ {(project.budgetUsed / 1000000).toFixed(1)}M / {(project.budget / 1000000).toFixed(1)}M</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>負責人：{project.owner}</span>
                      <span>{project.milestones.filter(m => m.status === 'done').length} / {project.milestones.length} 里程碑</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {filteredProjects.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">找不到符合條件的專案</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
