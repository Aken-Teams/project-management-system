'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PROJECT_TYPE_LABELS, type ProjectStatus, type ProjectType } from '@/lib/mock-data'
import { useProjectStore } from '@/lib/project-store'
import {
  Search,
  Users,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Loader2 } from 'lucide-react'
import type { Project } from '@/lib/mock-data'

export default function ProjectsPage() {
  const { user } = useAuth()
  const { projects: storeProjects } = useProjectStore()
  const [apiProjects, setApiProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<ProjectType | 'all'>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')

  // Fetch projects from API
  useEffect(() => {
    setLoading(true)
    fetch('/api/projects')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setApiProjects(data))
      .catch(() => setApiProjects([]))
      .finally(() => setLoading(false))
  }, [])

  // Merge: API projects + store projects (deduplicated by id)
  const allProjects = useMemo(() => {
    const apiIds = new Set(apiProjects.map((p) => p.id))
    const storeOnly = storeProjects.filter((p) => !apiIds.has(p.id))
    return [...apiProjects, ...storeOnly]
  }, [apiProjects, storeProjects])

  // 根據角色過濾專案
  const projects = user?.role === 'member'
    ? allProjects.filter(p => p.team.includes(user.name) || p.owner === user.name)
    : allProjects

  // 取得所有負責人列表
  const owners = useMemo(() => {
    const ownerSet = new Set(projects.map(p => p.owner))
    return Array.from(ownerSet).sort()
  }, [projects])

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.objective.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.projectCode.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter
    const matchesType = typeFilter === 'all' || project.projectType === typeFilter
    const matchesOwner = ownerFilter === 'all' || project.owner === ownerFilter
    return matchesSearch && matchesStatus && matchesType && matchesOwner
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
            <h1 className="text-2xl font-bold tracking-tight">
              {user?.role === 'member' ? '我的專案' : '專案看板'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {user?.role === 'member'
                ? '您參與的專案列表'
                : user?.role === 'executive'
                  ? '所有專案的整體概覽與追蹤'
                  : '管理和追蹤所有專案的進度與狀態'
              }
            </p>
          </div>
          {user?.role === 'pm' && (
            <Link href="/projects/new">
              <Button>建立新專案</Button>
            </Link>
          )}
        </div>

        {/* Filters - Single Row */}
        <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3 border">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋專案名稱、目標或編碼..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5">
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
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ProjectType | 'all')}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部類型</SelectItem>
              {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部負責人</SelectItem>
              {owners.map(owner => (
                <SelectItem key={owner} value={owner}>{owner}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(statusFilter !== 'all' || typeFilter !== 'all' || ownerFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setOwnerFilter('all') }}
            >
              清除
            </Button>
          )}
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">載入專案列表中...</p>
          </div>
        ) : (
        <>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 space-y-2.5">
                  {/* Row 1: Code + Type + Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-mono text-muted-foreground">{project.projectCode}</span>
                      <Badge variant="outline" className="text-sm">
                        {PROJECT_TYPE_LABELS[project.projectType]}
                      </Badge>
                    </div>
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

                  {/* Row 2: Name */}
                  <h3 className="font-semibold text-base line-clamp-1">{project.name}</h3>

                  {/* Row 3: Progress bar */}
                  <div className="flex items-center gap-3">
                    <Progress value={project.progress} className="h-1.5 flex-1" />
                    <span className="text-sm font-medium w-10 text-right shrink-0">{project.progress}%</span>
                  </div>

                  {/* Row 4: Meta info inline */}
                  <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{project.team.length} 人</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(project.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
                    {user?.role !== 'member' && (
                      <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{(project.budgetUsed / 1000000).toFixed(1)}M/{(project.budget / 1000000).toFixed(1)}M</span>
                    )}
                    <span className="ml-auto">{project.owner} · {project.milestones.filter(m => m.status === 'done').length}/{project.milestones.length} 里程碑</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {filteredProjects.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            找不到符合條件的專案
          </div>
        )}
        </>
        )}
      </div>
    </DashboardLayout>
  )
}
