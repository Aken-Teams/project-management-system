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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import { PROJECT_TIER_LABELS, type ProjectStatus, type ProjectTier, type Project } from '@/lib/mock-data'
import {
  Search,
  Users,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  RotateCcw,
  SlidersHorizontal,
  HelpCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { getRolePermissions } from '@/lib/permissions'
import { Loader2 } from 'lucide-react'
import { useProjectTypes } from '@/hooks/use-project-types'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function ProjectsPage() {
  const { user } = useAuth()
  const { projectTypes } = useProjectTypes()
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<ProjectTier | 'all'>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [memberFilter, setMemberFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<Date>(() => new Date(new Date().getFullYear(), 0, 1))
  const [dateTo, setDateTo] = useState<Date>(() => new Date(new Date().getFullYear(), 11, 31))
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 12

  // Default date range (current year)
  const defaultDateFrom = useMemo(() => new Date(new Date().getFullYear(), 0, 1), [])
  const defaultDateTo = useMemo(() => new Date(new Date().getFullYear(), 11, 31), [])

  // Fetch projects from API
  useEffect(() => {
    setLoading(true)
    fetch('/api/projects')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAllProjects(data))
      .catch(() => setAllProjects([]))
      .finally(() => setLoading(false))
  }, [])

  // 所有角色都能看到全部專案（細部權限由專案角色 RACIPS 控制）
  const projects = allProjects

  // 取得所有負責人列表
  const owners = useMemo(() => {
    const ownerSet = new Set(projects.map(p => p.owner))
    return Array.from(ownerSet).sort()
  }, [projects])

  // 取得所有負責執行成員 (角色 R)
  const responsibleMembers = useMemo(() => {
    const memberSet = new Set<string>()
    projects.forEach(p => {
      p.teamMembers?.forEach(tm => {
        if (tm.role === 'R') memberSet.add(tm.name)
      })
    })
    return Array.from(memberSet).sort()
  }, [projects])

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.objective.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.projectCode.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter
    const matchesType = typeFilter === 'all' || project.projectType === typeFilter
    const matchesTier = tierFilter === 'all' || project.projectTier === tierFilter
    const matchesOwner = ownerFilter === 'all' || project.owner === ownerFilter
    const matchesMember = memberFilter === 'all' || project.teamMembers?.some(tm => tm.role === 'R' && tm.name === memberFilter)
    // Date range filter: project overlaps with [dateFrom, dateTo]
    const projStart = new Date(project.startDate)
    const projEnd = new Date(project.endDate)
    const matchesDate = projStart <= dateTo && projEnd >= dateFrom
    return matchesSearch && matchesStatus && matchesType && matchesTier && matchesOwner && matchesMember && matchesDate
  })

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, typeFilter, tierFilter, ownerFilter, memberFilter, dateFrom, dateTo])

  // Check if any filter differs from defaults
  const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || tierFilter !== 'all' || ownerFilter !== 'all' || memberFilter !== 'all' ||
    dateFrom.getTime() !== defaultDateFrom.getTime() || dateTo.getTime() !== defaultDateTo.getTime()

  // Count active "more" filters (owner, member, date)
  const moreFilterCount = [
    ownerFilter !== 'all',
    memberFilter !== 'all',
    dateFrom.getTime() !== defaultDateFrom.getTime() || dateTo.getTime() !== defaultDateTo.getTime(),
  ].filter(Boolean).length

  const resetAllFilters = () => {
    setStatusFilter('all')
    setTypeFilter('all')
    setTierFilter('all')
    setOwnerFilter('all')
    setMemberFilter('all')
    setDateFrom(defaultDateFrom)
    setDateTo(defaultDateTo)
  }

  const totalPages = Math.ceil(filteredProjects.length / PAGE_SIZE)
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  // Generate visible page numbers (show max 5 pages around current)
  const getPageNumbers = useCallback(() => {
    const pages: number[] = []
    let start = Math.max(1, currentPage - 2)
    let end = Math.min(totalPages, start + 4)
    start = Math.max(1, end - 4)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }, [currentPage, totalPages])

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
            <h1 className="text-2xl font-bold tracking-tight">專案看板</h1>
            <p className="text-sm text-muted-foreground mt-1">管理和追蹤所有專案的進度與狀態</p>
          </div>
          {getRolePermissions(user?.role).canCreateProject && (
            <Link href="/projects/new">
              <Button>建立新專案</Button>
            </Link>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 bg-card rounded-lg px-3 py-2 border">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋專案名稱、目標或編碼..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as ProjectTier | 'all')}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部層級</SelectItem>
              {(Object.entries(PROJECT_TIER_LABELS) as [ProjectTier, string][]).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部類型</SelectItem>
              {projectTypes.map(({ key, label }) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProjectStatus | 'all')}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="green">正常</SelectItem>
              <SelectItem value="yellow">注意</SelectItem>
              <SelectItem value="red">風險</SelectItem>
            </SelectContent>
          </Select>
          {/* More filters popover */}
          <Popover open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />
                更多篩選
                {moreFilterCount > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1 text-xs">
                    {moreFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">負責人</label>
                  <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部負責人</SelectItem>
                      {owners.map(owner => (
                        <SelectItem key={owner} value={owner}>{owner}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">需求者</label>
                  <Select value={memberFilter} onValueChange={setMemberFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部需求者</SelectItem>
                      {responsibleMembers.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1">
                    日期範圍
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px] text-xs">
                          依專案的起迄日期篩選，只要專案期間與所選範圍有重疊即會顯示
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      { label: '今年', from: new Date(new Date().getFullYear(), 0, 1), to: new Date(new Date().getFullYear(), 11, 31) },
                      { label: '去年', from: new Date(new Date().getFullYear() - 1, 0, 1), to: new Date(new Date().getFullYear() - 1, 11, 31) },
                      { label: '近3個月', from: (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d })(), to: new Date() },
                      { label: '近6個月', from: (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d })(), to: new Date() },
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
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-start gap-1.5">
                        <CalendarDays className="h-4 w-4" />
                        {format(dateFrom, 'yyyy/MM/dd')} - {format(dateTo, 'yyyy/MM/dd')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4" align="start" side="bottom">
                      <div className="flex gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">開始日期</p>
                          <CalendarUI
                            mode="single"
                            selected={dateFrom}
                            onSelect={(d) => { if (!d) return; setDateFrom(d); if (d > dateTo) setDateTo(d) }}
                            locale={zhTW}
                          />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">結束日期</p>
                          <CalendarUI
                            mode="single"
                            selected={dateTo}
                            onSelect={(d) => d && setDateTo(d)}
                            disabled={(date) => date < dateFrom}
                            locale={zhTW}
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAllFilters}
              className="h-9 gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重設
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
          {paginatedProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 space-y-2.5">
                  {/* Row 1: Code + Type + Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-mono text-muted-foreground">{project.projectCode}</span>
                      <Badge variant="outline" className="text-sm">
                        {projectTypes.find(t => t.key === project.projectType)?.label ?? project.projectType}
                      </Badge>
                      <Badge variant="outline" className={`text-sm font-semibold ${
                        project.projectTier === 'T1' ? 'border-blue-400 text-blue-600' :
                        project.projectTier === 'T2' ? 'border-emerald-400 text-emerald-600' :
                        project.projectTier === 'T3' ? 'border-amber-400 text-amber-600' :
                        'border-purple-400 text-purple-600'
                      }`}>
                        {project.projectTier}
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
                    <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{(project.budgetUsed / 1000000).toFixed(1)}M/{(project.budget / 1000000).toFixed(1)}M</span>
                    <span className="ml-auto">{project.owner} · {project.milestones.filter(m => m.status === 'done').length}/{project.milestones.length} 里程碑</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              共 {filteredProjects.length} 個專案，第 {currentPage}/{totalPages} 頁
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {getPageNumbers().map(page => (
                <Button
                  key={page}
                  variant={page === currentPage ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

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
